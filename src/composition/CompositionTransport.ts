import type { AudioEngine, CompositionAudioRouting } from '../audio/AudioEngine.ts'
import { CompositionPcmRecorder } from './CompositionPcmRecorder.ts'
import { applyLoopBoundaryCrossfade, clampBoundaryCrossfade, createTransportSchedule, DEFAULT_BOUNDARY_CROSSFADE_SECONDS } from './transportMath.ts'
import { canTransition } from './transportState.ts'
import { clampLayerVolume, deriveAudibleLayerIds, validateLayerForSession, validateLayerName } from './layerModel.ts'
import { DEFAULT_COMPOSITION_SETTINGS, MAX_COMPOSITION_LAYERS, type CompositionLayerMetadata, type CompositionSession, type CompositionSettings, type CompositionTransportSnapshot, type TransportSchedule, type TransportState, type UndoAction } from './compositionTypes.ts'

type LayerSource = { layerId: string; source: AudioBufferSourceNode; gain: GainNode; stopped: boolean }
type PendingRecording = { kind: 'first' | 'add' | 'replace'; replaceLayerId: string | null }
type PendingSilentLayer = { metadata: CompositionLayerMetadata; buffer: AudioBuffer; replaceLayerId: string | null }
type UndoSnapshot = { action: Exclude<UndoAction, null>; session: CompositionSession | null; buffers: Map<string, AudioBuffer> }

function newId(prefix: string) { return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}` }

/** Manages up to four exact-frame internal-performance layers in one session-only composition. */
export class CompositionTransport {
  private settings: CompositionSettings = { ...DEFAULT_COMPOSITION_SETTINGS }
  private state: TransportState = 'idle'
  private composition: CompositionSession | null = null
  private runtimeBuffers = new Map<string, AudioBuffer>()
  private undo: UndoSnapshot | null = null
  private schedule: TransportSchedule | null = null
  private routing: CompositionAudioRouting | null = null
  private recorder: CompositionPcmRecorder | null = null
  private compositionBus: GainNode | null = null
  private layerSources = new Map<string, LayerSource>()
  private sharedPlaybackStartTime: number | null = null
  private metronomeSources = new Set<OscillatorNode>()
  private listeners = new Set<(snapshot: CompositionTransportSnapshot) => void>()
  private error: string | null = null
  private warning: string | null = null
  private receivedFrameCount = 0
  private recordingTimer: number | null = null
  private countInTimer: number | null = null
  private cycleStartedAt: number | null = null
  private pendingSilentLayer: PendingSilentLayer | null = null
  private readonly engine: AudioEngine

  constructor(engine: AudioEngine) { this.engine = engine }

  subscribe(listener: (snapshot: CompositionTransportSnapshot) => void) { this.listeners.add(listener); listener(this.getSnapshot()); return () => this.listeners.delete(listener) }

  getSnapshot(): CompositionTransportSnapshot {
    const now = this.routing?.context.currentTime ?? 0
    const schedule = this.schedule
    const progressStart = this.state === 'countingIn' ? schedule?.countInStartTime : this.state === 'recordingLayer' ? schedule?.recordingStartTime : this.cycleStartedAt
    const perBeat = schedule?.secondsPerBeat ?? 0
    const elapsed = progressStart === undefined || progressStart === null ? 0 : Math.max(0, now - progressStart)
    const currentBeat = perBeat ? Math.min(4, (Math.floor(elapsed / perBeat) % 4) + 1) : 1
    const currentBar = perBeat ? Math.max(1, Math.floor(elapsed / (perBeat * 4)) + 1) : 1
    const remainingCountInBars = this.state === 'countingIn' && schedule ? Math.max(0, Math.ceil((schedule.recordingStartTime - now) / schedule.secondsPerBar)) : 0
    const loopCycleCount = this.state === 'playing' && schedule && this.cycleStartedAt !== null ? Math.max(0, Math.floor((now - this.cycleStartedAt) / schedule.loopDurationSeconds)) : 0
    return {
      state: this.state, settings: this.settings, composition: this.composition, error: this.error, warning: this.warning, schedule,
      currentBar, currentBeat, remainingCountInBars, loopCycleCount, playbackActive: this.layerSources.size > 0,
      workletStatus: this.recorder?.workletStatus ?? 'idle', recordingTapActive: this.routing !== null, receivedFrameCount: this.receivedFrameCount,
      undoAction: this.undo?.action ?? null, sourceGroupSize: this.layerSources.size,
      sharedPlaybackStartTime: this.sharedPlaybackStartTime, compositionBusActive: this.compositionBus !== null,
      audibleLayerIds: this.composition ? deriveAudibleLayerIds(this.composition.layers) : [],
      mutedLayerIds: this.composition?.layers.filter((layer) => layer.muted).map((layer) => layer.id) ?? [],
      soloedLayerIds: this.composition?.layers.filter((layer) => layer.solo).map((layer) => layer.id) ?? [],
      runtimeBufferIds: [...this.runtimeBuffers.keys()],
      pendingSilentLayerId: this.pendingSilentLayer?.metadata.id ?? null,
    }
  }

  updateSettings(next: Partial<CompositionSettings>) {
    if (this.composition?.layers.length) throw new Error('Clear all composition layers before changing BPM or loop length.')
    if (['armed', 'countingIn', 'recordingLayer', 'processingLayer', 'replacingLayer'].includes(this.state)) throw new Error('Tempo and loop settings cannot change while recording.')
    this.settings = { ...this.settings, ...next }; this.error = null; this.publish()
  }

  async recordFirstLayer() { return this.recordLayer({ kind: 'first', replaceLayerId: null }) }
  async addLayer() {
    if (!this.composition) throw new Error('Record the first layer before adding another.')
    if (this.composition.layers.length >= MAX_COMPOSITION_LAYERS) throw new Error('This composition already has the four-layer limit.')
    return this.recordLayer({ kind: 'add', replaceLayerId: null })
  }
  async replaceActiveLayer() {
    if (!this.composition?.activeLayerId) throw new Error('Select a layer to replace.')
    return this.recordLayer({ kind: 'replace', replaceLayerId: this.composition.activeLayerId })
  }

  async recordLayer(pending: PendingRecording) {
    if (['armed', 'countingIn', 'recordingLayer', 'processingLayer', 'replacingLayer'].includes(this.state)) throw new Error('Layer recording is already active.')
    if (this.pendingSilentLayer) throw new Error('Keep or discard the nearly silent layer before recording another one.')
    try {
      this.stopAllLayers()
      this.error = null; this.warning = null
      this.transition(pending.kind === 'replace' ? 'replacingLayer' : 'armed', true)
      this.routing = await this.engine.getCompositionRouting()
      this.ensureCompositionBus(this.routing)
      this.recorder ??= new CompositionPcmRecorder(this.routing.context, this.routing.recordingTap, this.routing.monitoringOutput)
      await this.recorder.prepare()
      const schedule = this.composition ? this.scheduleForComposition(this.composition, this.routing.context.currentTime) : createTransportSchedule(this.settings, this.routing.context.sampleRate, this.routing.context.currentTime)
      this.schedule = schedule
      const { completion } = await this.recorder.arm(schedule.startFrame, schedule.endFrame, 2)
      this.scheduleMetronome(this.routing, schedule)
      if (this.settings.countInBars > 0) {
        if (this.composition) {
          // Backing is audible during count-in, but starts at an offset chosen
          // to reach layer frame zero exactly when the new recording begins.
          const offset = (this.composition.durationSeconds - (schedule.countInDurationSeconds % this.composition.durationSeconds)) % this.composition.durationSeconds
          this.startLayerSourceGroup(schedule.countInStartTime, pending.kind === 'replace' ? pending.replaceLayerId : null, offset)
        }
        this.transition('countingIn', true)
        this.countInTimer = window.setTimeout(() => {
          if (this.state === 'countingIn') {
            this.startBackingAndRecording(schedule, pending)
          }
        }, Math.max(0, (schedule.recordingStartTime - this.routing!.context.currentTime) * 1000))
      } else this.startBackingAndRecording(schedule, pending)
      this.recordingTimer = window.setTimeout(() => { if (this.state === 'recordingLayer') this.transition('processingLayer', true) }, Math.max(0, (schedule.recordingEndTime - this.routing.context.currentTime) * 1000))
      const pcm = await completion
      if (!pcm) return
      this.cancelTimers(); this.stopAllLayers(); this.transition('processingLayer', true)
      this.receivedFrameCount = pcm.receivedFrameCount
      const created = this.createRecordedLayer(pcm, schedule, this.routing, pending)
      if (peakOfChannels(pcm.channels) < 0.0001) {
        this.pendingSilentLayer = created
        this.warning = 'This new layer is nearly silent. Keep Layer, Record Again, or Cancel before continuing.'
        this.transition('compositionReady', true)
        return
      }
      this.commitRecordedLayer(created)
    } catch (error) {
      this.cancelTimers(); this.stopMetronome(); this.stopAllLayers(); this.recorder?.cancel()
      this.error = error instanceof Error ? error.message : 'The layer could not be recorded.'
      this.transition(this.composition ? 'compositionReady' : 'error', true)
    }
  }

  keepPendingSilentLayer() { if (!this.pendingSilentLayer) return; this.commitRecordedLayer(this.pendingSilentLayer) }
  discardPendingSilentLayer() { if (!this.pendingSilentLayer) return; this.pendingSilentLayer = null; this.warning = 'Nearly silent layer discarded.'; this.transition(this.composition ? 'compositionReady' : 'idle', true) }
  async recordAgainPendingLayer() {
    const pending = this.pendingSilentLayer
    if (!pending) return
    this.pendingSilentLayer = null
    this.warning = null
    await this.recordLayer({ kind: pending.replaceLayerId ? 'replace' : this.composition ? 'add' : 'first', replaceLayerId: pending.replaceLayerId })
  }

  cancelRecording(reason = 'Layer recording cancelled.') {
    if (!['armed', 'countingIn', 'recordingLayer', 'processingLayer', 'replacingLayer'].includes(this.state)) return
    this.cancelTimers(); this.stopMetronome(); this.stopAllLayers(); this.recorder?.cancel()
    this.error = reason; this.transition(this.composition ? 'compositionReady' : 'idle', true)
  }

  playAll() {
    if (!this.composition) throw new Error('Record a first layer before playback.')
    this.assertValidCompositionBuffers()
    if (!this.routing) throw new Error('Enable Audio before playing the composition.')
    this.stopAllLayers()
    const startTime = this.routing.context.currentTime + 0.015
    this.startLayerSourceGroup(startTime)
    this.cycleStartedAt = startTime; this.transition('playing', true)
  }

  stopAllLayers() {
    const now = this.routing?.context.currentTime ?? 0
    this.layerSources.forEach((entry) => this.stopLayerSource(entry, now))
    this.layerSources.clear(); this.cycleStartedAt = null
    this.sharedPlaybackStartTime = null
    this.stopMetronome()
    if (this.state === 'playing') this.transition('stopped', true)
  }

  selectLayer(layerId: string) { if (!this.composition?.layers.some((layer) => layer.id === layerId)) throw new Error('That layer is unavailable.'); this.composition = { ...this.composition, activeLayerId: layerId }; this.publish() }
  renameActiveLayer(name: string) { this.updateActiveLayer({ name: validateLayerName(name), modifiedAt: Date.now() }) }
  setLayerMuted(layerId: string, muted: boolean) { this.updateLayer(layerId, { muted, modifiedAt: Date.now() }); this.applyAudibilityToActiveSources(); this.publish() }
  setLayerSolo(layerId: string, solo: boolean) { this.updateLayer(layerId, { solo, modifiedAt: Date.now() }); this.applyAudibilityToActiveSources(); this.publish() }
  setLayerVolume(layerId: string, volume: number) { this.updateLayer(layerId, { volume: clampLayerVolume(volume), modifiedAt: Date.now() }); this.applyAudibilityToActiveSources(); this.publish() }

  deleteActiveLayer() {
    const activeId = this.composition?.activeLayerId
    if (!this.composition || !activeId) throw new Error('Select a layer to delete.')
    this.stopAllLayers(); this.storeUndo('delete-layer')
    const layers = this.composition.layers.filter((layer) => layer.id !== activeId).map((layer, order) => ({ ...layer, order }))
    this.runtimeBuffers.delete(activeId)
    this.composition = layers.length ? { ...this.composition, layers, activeLayerId: layers[0]?.id ?? null, modifiedAt: Date.now() } : null
    this.transition(this.composition ? 'compositionReady' : 'idle', true)
  }

  clearComposition() {
    if (!this.composition) return
    this.stopAllLayers(); this.storeUndo('clear-composition'); this.composition = null; this.runtimeBuffers.clear(); this.schedule = null; this.pendingSilentLayer = null
    this.transition('idle', true)
  }

  undoLastAction() {
    if (!this.undo) return
    this.stopAllLayers(); this.composition = cloneSession(this.undo.session); this.runtimeBuffers = new Map(this.undo.buffers); this.schedule = this.composition ? this.scheduleForComposition(this.composition, 0) : null
    this.undo = null; this.transition(this.composition ? 'compositionReady' : 'idle', true)
  }

  dispose() { this.cancelRecording('Composition transport disposed.'); this.stopAllLayers(); this.recorder?.dispose(); this.recorder = null; this.compositionBus?.disconnect(); this.compositionBus = null; this.listeners.clear() }

  private startBackingAndRecording(schedule: TransportSchedule, pending: PendingRecording) {
    if (this.composition && this.layerSources.size === 0) this.startLayerSourceGroup(schedule.recordingStartTime, pending.kind === 'replace' ? pending.replaceLayerId : null)
    this.transition('recordingLayer', true)
  }

  private startLayerSourceGroup(startTime: number, excludedLayerId: string | null = null, initialOffset = 0) {
    if (!this.composition || !this.routing || !this.compositionBus) return
    this.assertValidCompositionBuffers()
    const audible = new Set(deriveAudibleLayerIds(this.composition.layers))
    this.sharedPlaybackStartTime = startTime
    this.composition.layers.forEach((layer) => {
      if (!audible.has(layer.id) || layer.id === excludedLayerId) return
      const buffer = this.runtimeBuffers.get(layer.id)
      if (!buffer) return
      const source = this.routing!.context.createBufferSource()
      const gain = this.routing!.context.createGain()
      source.buffer = buffer; source.loop = true; source.loopStart = 0; source.loopEnd = this.composition!.durationSeconds
      gain.gain.setValueAtTime(0.0001, startTime); gain.gain.linearRampToValueAtTime(layer.volume, startTime + 0.012)
      source.connect(gain).connect(this.compositionBus!)
      const entry: LayerSource = { layerId: layer.id, source, gain, stopped: false }
      source.onended = () => { source.disconnect(); gain.disconnect(); if (this.layerSources.get(layer.id) === entry) this.layerSources.delete(layer.id) }
      source.start(startTime, initialOffset); this.layerSources.set(layer.id, entry)
    })
  }

  private stopLayerSource(entry: LayerSource, now: number) {
    if (entry.stopped) return
    entry.stopped = true; entry.gain.gain.cancelScheduledValues(now); entry.gain.gain.setValueAtTime(Math.max(entry.gain.gain.value, 0.0001), now); entry.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.02)
    try { entry.source.stop(now + 0.025) } catch { /* A one-use source may already have ended. */ }
  }

  private createRecordedLayer(pcm: { channels: Float32Array[]; expectedFrameCount: number; receivedFrameCount: number }, schedule: TransportSchedule, routing: CompositionAudioRouting, pending: PendingRecording): PendingSilentLayer {
    const buffer = routing.context.createBuffer(pcm.channels.length, pcm.expectedFrameCount, routing.context.sampleRate)
    pcm.channels.forEach((channel, index) => buffer.getChannelData(index).set(channel))
    const crossfade = clampBoundaryCrossfade(DEFAULT_BOUNDARY_CROSSFADE_SECONDS, buffer.duration); applyLoopBoundaryCrossfade(buffer, crossfade)
    const existing = pending.replaceLayerId ? this.composition?.layers.find((layer) => layer.id === pending.replaceLayerId) : null
    const source = this.engine.getActiveSoundSource(); const sourceInstrumentId = source.type === 'built-in' ? source.instrumentId : source.soundId
    const now = Date.now()
    const metadata: CompositionLayerMetadata = {
      id: existing?.id ?? newId('layer'), name: existing?.name ?? `Layer ${(this.composition?.layers.length ?? 0) + 1}`, order: existing?.order ?? (this.composition?.layers.length ?? 0),
      bpm: this.composition?.bpm ?? this.settings.bpm, timeSignature: '4/4', barCount: this.composition?.barCount ?? this.settings.barCount,
      beatCount: (this.composition?.barCount ?? this.settings.barCount) * 4, durationSeconds: schedule.loopDurationSeconds, sampleRate: routing.context.sampleRate, frameCount: pcm.expectedFrameCount, channelCount: pcm.channels.length,
      muted: existing?.muted ?? false, solo: existing?.solo ?? false, volume: existing?.volume ?? 1, createdAt: existing?.createdAt ?? now, modifiedAt: now,
      sourceInstrumentId, sourceSoundType: source.type, boundaryCrossfadeDuration: crossfade, recordingDiscrepancyFrames: pcm.receivedFrameCount - pcm.expectedFrameCount, recordingArchitectureVersion: 1,
    }
    return { metadata, buffer, replaceLayerId: pending.replaceLayerId }
  }

  private commitRecordedLayer(pending: PendingSilentLayer) {
    const now = Date.now()
    if (!this.composition) {
      this.composition = { id: newId('composition'), name: 'Session composition', bpm: pending.metadata.bpm, timeSignature: '4/4', barCount: pending.metadata.barCount, durationSeconds: pending.metadata.durationSeconds, sampleRate: pending.metadata.sampleRate, expectedFrameCount: pending.metadata.frameCount, layers: [pending.metadata], activeLayerId: pending.metadata.id, createdAt: now, modifiedAt: now, sessionOnly: true, architectureVersion: 2 }
    } else if (pending.replaceLayerId) {
      this.storeUndo('replace-layer')
      validateReplacement(this.composition, pending.metadata)
      this.composition = { ...this.composition, layers: this.composition.layers.map((layer) => layer.id === pending.metadata.id ? pending.metadata : layer), activeLayerId: pending.metadata.id, modifiedAt: now }
    } else {
      validateLayerForSession(this.composition, pending.metadata)
      this.composition = { ...this.composition, layers: [...this.composition.layers, pending.metadata], activeLayerId: pending.metadata.id, modifiedAt: now }
    }
    this.runtimeBuffers.set(pending.metadata.id, pending.buffer); this.pendingSilentLayer = null
    this.warning = pending.metadata.recordingDiscrepancyFrames ? `Layer adjusted by ${pending.metadata.recordingDiscrepancyFrames} frame(s) to match the composition.` : null
    this.transition('compositionReady', true)
  }

  private ensureCompositionBus(routing: CompositionAudioRouting) { if (!this.compositionBus) { this.compositionBus = routing.context.createGain(); this.compositionBus.gain.setValueAtTime(1, routing.context.currentTime); this.compositionBus.connect(routing.monitoringOutput) } }
  private scheduleForComposition(composition: CompositionSession, now: number) { return createTransportSchedule({ ...this.settings, bpm: composition.bpm, barCount: composition.barCount }, composition.sampleRate, now) }
  private assertValidCompositionBuffers() { if (!this.composition) return; this.composition.layers.forEach((layer) => { const buffer = this.runtimeBuffers.get(layer.id); if (!buffer) throw new Error(`Layer “${layer.name}” has no runtime audio buffer.`); if (buffer.length !== this.composition!.expectedFrameCount || buffer.sampleRate !== this.composition!.sampleRate) throw new Error(`Layer “${layer.name}” does not match the composition frame timing.`) }) }
  private updateActiveLayer(update: Partial<CompositionLayerMetadata>) { if (!this.composition?.activeLayerId) throw new Error('Select a layer first.'); this.updateLayer(this.composition.activeLayerId, update) }
  private updateLayer(layerId: string, update: Partial<CompositionLayerMetadata>) { if (!this.composition?.layers.some((layer) => layer.id === layerId)) throw new Error('That layer is unavailable.'); this.composition = { ...this.composition, layers: this.composition.layers.map((layer) => layer.id === layerId ? { ...layer, ...update } : layer), modifiedAt: Date.now() }; this.publish() }
  private applyAudibilityToActiveSources() {
    if (!this.composition || !this.routing) return
    const audible = new Set(deriveAudibleLayerIds(this.composition.layers))
    const totalRequestedGain = this.composition.layers.filter((layer) => audible.has(layer.id)).reduce((total, layer) => total + layer.volume, 0)
    this.warning = totalRequestedGain > 2.5 ? 'Several loud layers may drive the final output hard. The compressor remains active; lower a layer or manual master volume if needed.' : null
    const now = this.routing.context.currentTime
    this.layerSources.forEach((entry, layerId) => {
      const layer = this.composition!.layers.find((item) => item.id === layerId)
      if (!layer) return
      entry.gain.gain.setTargetAtTime(audible.has(layerId) ? layer.volume : 0.0001, now, 0.015)
    })
  }
  private storeUndo(action: Exclude<UndoAction, null>) { this.undo = { action, session: cloneSession(this.composition), buffers: new Map(this.runtimeBuffers) } }
  private scheduleMetronome(routing: CompositionAudioRouting, schedule: TransportSchedule) { if (!this.settings.metronomeEnabled) return; const beats = (this.settings.countInBars + (this.composition?.barCount ?? this.settings.barCount)) * 4; for (let index = 0; index < beats; index += 1) { const time = schedule.countInStartTime + index * schedule.secondsPerBeat; const source = routing.context.createOscillator(); const gain = routing.context.createGain(); const beat = index % 4; source.frequency.setValueAtTime(beat === 0 ? 1320 : 880, time); gain.gain.setValueAtTime(0.0001, time); gain.gain.exponentialRampToValueAtTime(this.settings.metronomeGain * (beat === 0 ? 1 : 0.65), time + 0.001); gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.035); source.connect(gain).connect(routing.monitoringOutput); source.onended = () => { source.disconnect(); gain.disconnect(); this.metronomeSources.delete(source) }; source.start(time); source.stop(time + 0.04); this.metronomeSources.add(source) } }
  private stopMetronome() { const now = this.routing?.context.currentTime ?? 0; this.metronomeSources.forEach((source) => { try { source.stop(now) } catch { /* already ended */ } }); this.metronomeSources.clear() }
  private cancelTimers() { if (this.recordingTimer !== null) window.clearTimeout(this.recordingTimer); if (this.countInTimer !== null) window.clearTimeout(this.countInTimer); this.recordingTimer = null; this.countInTimer = null }
  private transition(next: TransportState, force = false) { if (!force && !canTransition(this.state, next)) throw new Error(`Cannot move transport from ${this.state} to ${next}.`); this.state = next; this.publish() }
  private publish() { this.listeners.forEach((listener) => listener(this.getSnapshot())) }
}

function validateReplacement(session: CompositionSession, layer: CompositionLayerMetadata) { const current = session.layers.find((item) => item.id === layer.id); if (!current) throw new Error('The layer selected for replacement no longer exists.'); if (layer.frameCount !== session.expectedFrameCount || layer.sampleRate !== session.sampleRate || layer.durationSeconds !== session.durationSeconds) throw new Error('Replacement layers must match the composition timing.') }
function cloneSession(session: CompositionSession | null) { return session ? { ...session, layers: session.layers.map((layer) => ({ ...layer })) } : null }
function peakOfChannels(channels: Float32Array[]) { let peak = 0; channels.forEach((channel) => { for (let frame = 0; frame < channel.length; frame += 1) peak = Math.max(peak, Math.abs(channel[frame])) }); return peak }
