import type { AudioEngine, CompositionAudioRouting } from '../audio/AudioEngine.ts'
import { CompositionPcmRecorder } from './CompositionPcmRecorder.ts'
import { applyLoopBoundaryCrossfade, clampBoundaryCrossfade, createTransportSchedule, DEFAULT_BOUNDARY_CROSSFADE_SECONDS } from './transportMath.ts'
import { canTransition } from './transportState.ts'
import { DEFAULT_COMPOSITION_SETTINGS, type CompositionLoop, type CompositionLoopMetadata, type CompositionSettings, type CompositionTransportSnapshot, type TransportSchedule, type TransportState } from './compositionTypes.ts'

type LoopSource = { source: AudioBufferSourceNode; gain: GainNode; stopped: boolean }

function newLoopId() { return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `loop-${Date.now()}-${Math.random().toString(16).slice(2)}` }

/** Owns one session-only composition loop and never routes it back to the performance tap. */
export class CompositionTransport {
  private settings: CompositionSettings = { ...DEFAULT_COMPOSITION_SETTINGS }
  private state: TransportState = 'idle'
  private loop: CompositionLoop | null = null
  private undoLoop: CompositionLoop | null = null
  private schedule: TransportSchedule | null = null
  private routing: CompositionAudioRouting | null = null
  private recorder: CompositionPcmRecorder | null = null
  private loopSource: LoopSource | null = null
  private metronomeSources = new Set<OscillatorNode>()
  private listeners = new Set<(snapshot: CompositionTransportSnapshot) => void>()
  private error: string | null = null
  private warning: string | null = null
  private receivedFrameCount = 0
  private recordingTimer: number | null = null
  private countInTimer: number | null = null
  private cycleStartedAt: number | null = null
  private readonly engine: AudioEngine

  constructor(engine: AudioEngine) { this.engine = engine }

  subscribe(listener: (snapshot: CompositionTransportSnapshot) => void) {
    this.listeners.add(listener)
    listener(this.getSnapshot())
    return () => this.listeners.delete(listener)
  }

  getSnapshot(): CompositionTransportSnapshot {
    const now = this.routing?.context.currentTime ?? 0
    const schedule = this.schedule
    const progressStart = this.state === 'countingIn' ? schedule?.countInStartTime : this.state === 'recording' ? schedule?.recordingStartTime : this.cycleStartedAt
    const perBeat = schedule?.secondsPerBeat ?? 0
    const elapsed = progressStart !== null && progressStart !== undefined ? Math.max(0, now - progressStart) : 0
    const currentBeat = perBeat ? Math.min(4, (Math.floor(elapsed / perBeat) % 4) + 1) : 1
    const currentBar = perBeat ? Math.max(1, Math.floor(elapsed / (perBeat * 4)) + 1) : 1
    const remainingCountInBars = this.state === 'countingIn' && schedule
      ? Math.max(0, Math.ceil((schedule.recordingStartTime - now) / schedule.secondsPerBar))
      : 0
    const loopCycleCount = this.state === 'playing' && schedule && this.cycleStartedAt !== null
      ? Math.max(0, Math.floor((now - this.cycleStartedAt) / schedule.loopDurationSeconds))
      : 0
    return {
      state: this.state,
      settings: this.settings,
      loop: this.loop,
      undoLoop: this.undoLoop,
      error: this.error,
      warning: this.warning,
      schedule,
      currentBar,
      currentBeat,
      remainingCountInBars,
      loopCycleCount,
      playbackActive: this.loopSource !== null,
      workletStatus: this.recorder?.workletStatus ?? 'idle',
      recordingTapActive: this.routing !== null,
      receivedFrameCount: this.receivedFrameCount,
    }
  }

  updateSettings(next: Partial<CompositionSettings>) {
    if (this.state === 'countingIn' || this.state === 'recording' || this.state === 'processing') {
      throw new Error('Tempo and loop settings cannot change while recording.')
    }
    this.settings = { ...this.settings, ...next }
    this.error = null
    this.publish()
  }

  async record(replace = false) {
    if (this.state === 'countingIn' || this.state === 'recording' || this.state === 'processing' || this.state === 'armed') throw new Error('Composition recording is already active.')
    if (this.loop && !replace) throw new Error('A loop already exists. Select Re-record Loop to replace it.')
    try {
      if (this.state === 'playing') this.stopLoop()
      this.error = null
      this.warning = null
      this.transition('armed')
      this.routing = await this.engine.getCompositionRouting()
      this.recorder ??= new CompositionPcmRecorder(this.routing.context, this.routing.recordingTap, this.routing.monitoringOutput)
      // Wait for the one-time worklet registration before choosing a near-future
      // frame boundary. Otherwise a cold module load could overrun the start.
      await this.recorder.prepare()
      const schedule = createTransportSchedule(this.settings, this.routing.context.sampleRate, this.routing.context.currentTime)
      this.schedule = schedule
      const { completion } = await this.recorder.arm(schedule.startFrame, schedule.endFrame, 2)
      this.scheduleMetronome(this.routing, schedule)
      if (this.settings.countInBars > 0) {
        this.transition('countingIn')
        this.countInTimer = window.setTimeout(() => { if (this.state === 'countingIn') { this.transition('recording') } }, Math.max(0, (schedule.recordingStartTime - this.routing!.context.currentTime) * 1000))
      } else {
        this.transition('recording')
      }
      this.recordingTimer = window.setTimeout(() => { if (this.state === 'recording') this.transition('processing') }, Math.max(0, (schedule.recordingEndTime - this.routing.context.currentTime) * 1000))
      const pcm = await completion
      if (!pcm || this.state === 'idle') return
      this.cancelTimers()
      // The UI timer may already have entered processing at this exact frame.
      // Capture completion is authoritative, so setting the same state is safe.
      this.transition('processing', true)
      this.receivedFrameCount = pcm.receivedFrameCount
      const nextLoop = this.createLoop(pcm, schedule, this.routing)
      if (replace && this.loop) this.undoLoop = this.loop
      this.loop = nextLoop
      this.transition('loopReady')
    } catch (error) {
      this.cancelTimers()
      this.stopMetronome()
      this.recorder?.cancel()
      this.error = error instanceof Error ? error.message : 'The composition loop could not be recorded.'
      this.transition(this.loop ? 'loopReady' : 'error', true)
    }
  }

  cancelRecording(reason = 'Recording cancelled.') {
    if (!['armed', 'countingIn', 'recording', 'processing'].includes(this.state)) return
    this.cancelTimers()
    this.stopMetronome()
    this.recorder?.cancel()
    this.error = reason
    this.transition(this.loop ? 'loopReady' : 'idle', true)
  }

  playLoop() {
    if (!this.loop) throw new Error('Record a loop before playback.')
    if (this.state === 'processing' || this.state === 'recording' || this.state === 'countingIn') throw new Error('Wait for recording to finish before playback.')
    if (!this.routing) throw new Error('Enable Audio before playing the composition loop.')
    this.stopLoop()
    const { context, monitoringOutput } = this.routing
    const source = context.createBufferSource()
    const gain = context.createGain()
    source.buffer = this.loop.buffer
    source.loop = true
    source.loopStart = 0
    source.loopEnd = this.loop.metadata.durationSeconds
    gain.gain.setValueAtTime(0.0001, context.currentTime)
    gain.gain.linearRampToValueAtTime(1, context.currentTime + 0.012)
    source.connect(gain).connect(monitoringOutput)
    const loopSource: LoopSource = { source, gain, stopped: false }
    source.onended = () => {
      source.disconnect(); gain.disconnect()
      if (this.loopSource === loopSource) { this.loopSource = null; this.publish() }
    }
    source.start(context.currentTime + 0.01)
    this.loopSource = loopSource
    this.cycleStartedAt = context.currentTime + 0.01
    this.transition('playing', true)
  }

  stopLoop() {
    const loopSource = this.loopSource
    if (!loopSource || !this.routing) {
      if (this.state === 'playing') this.transition('stopped', true)
      return
    }
    if (loopSource.stopped) return
    loopSource.stopped = true
    const now = this.routing.context.currentTime
    loopSource.gain.gain.cancelScheduledValues(now)
    loopSource.gain.gain.setValueAtTime(Math.max(loopSource.gain.gain.value, 0.0001), now)
    loopSource.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025)
    try { loopSource.source.stop(now + 0.03) } catch { /* One-use sources are safe if already stopped. */ }
    this.loopSource = null
    this.cycleStartedAt = null
    this.transition('stopped', true)
  }

  clearLoop() {
    if (!this.loop) return
    this.stopLoop()
    this.undoLoop = this.loop
    this.loop = null
    this.schedule = null
    this.transition('idle', true)
  }

  undo() {
    if (!this.undoLoop) return
    this.stopLoop()
    this.loop = this.undoLoop
    this.undoLoop = null
    this.schedule = scheduleFromLoop(this.loop)
    this.transition('loopReady', true)
  }

  dispose() {
    this.cancelRecording('Composition transport disposed.')
    this.stopLoop()
    this.stopMetronome()
    this.recorder?.dispose()
    this.recorder = null
    this.listeners.clear()
  }

  private createLoop(pcm: { channels: Float32Array[]; expectedFrameCount: number; receivedFrameCount: number }, schedule: TransportSchedule, routing: CompositionAudioRouting): CompositionLoop {
    const buffer = routing.context.createBuffer(pcm.channels.length, pcm.expectedFrameCount, routing.context.sampleRate)
    pcm.channels.forEach((channel, index) => buffer.getChannelData(index).set(channel))
    const crossfade = clampBoundaryCrossfade(DEFAULT_BOUNDARY_CROSSFADE_SECONDS, buffer.duration)
    applyLoopBoundaryCrossfade(buffer, crossfade)
    const discrepancy = pcm.receivedFrameCount - pcm.expectedFrameCount
    if (discrepancy !== 0) this.warning = `Recorder frame difference: ${discrepancy > 0 ? '+' : ''}${discrepancy}; the loop was ${discrepancy > 0 ? 'trimmed' : 'silence-padded'} to its exact musical length.`
    const peak = peakOfChannels(pcm.channels)
    if (peak < 0.0001) this.warning = 'This loop is nearly silent. You can re-record it; the exact silent loop was kept.'
    const activeSource = this.engine.getActiveSoundSource()
    const sourceInstrumentId = activeSource.type === 'built-in' ? activeSource.instrumentId : activeSource.soundId
    const metadata: CompositionLoopMetadata = {
      id: newLoopId(), name: 'Session loop', bpm: this.settings.bpm, timeSignature: '4/4', barCount: this.settings.barCount,
      beatCount: this.settings.barCount * 4, durationSeconds: schedule.loopDurationSeconds, sampleRate: routing.context.sampleRate,
      frameCount: pcm.expectedFrameCount, channelCount: pcm.channels.length, createdAt: Date.now(),
      sourceInstrumentId,
      boundaryCrossfadeDuration: crossfade, recordingDiscrepancyFrames: discrepancy, recordingArchitectureVersion: 1,
    }
    return { buffer, metadata }
  }

  private scheduleMetronome(routing: CompositionAudioRouting, schedule: TransportSchedule) {
    if (!this.settings.metronomeEnabled) return
    const totalBeats = (this.settings.countInBars + this.settings.barCount) * 4
    for (let index = 0; index < totalBeats; index += 1) {
      const time = schedule.countInStartTime + index * schedule.secondsPerBeat
      const source = routing.context.createOscillator()
      const gain = routing.context.createGain()
      const beatInBar = index % 4
      source.frequency.setValueAtTime(beatInBar === 0 ? 1320 : 880, time)
      gain.gain.setValueAtTime(0.0001, time)
      gain.gain.exponentialRampToValueAtTime(this.settings.metronomeGain * (beatInBar === 0 ? 1 : 0.65), time + 0.001)
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.035)
      source.connect(gain).connect(routing.monitoringOutput)
      source.onended = () => { source.disconnect(); gain.disconnect(); this.metronomeSources.delete(source) }
      source.start(time); source.stop(time + 0.04)
      this.metronomeSources.add(source)
    }
  }

  private stopMetronome() {
    const now = this.routing?.context.currentTime ?? 0
    this.metronomeSources.forEach((source) => { try { source.stop(now) } catch { /* Already ended click. */ } })
    this.metronomeSources.clear()
  }

  private cancelTimers() {
    if (this.recordingTimer !== null) window.clearTimeout(this.recordingTimer)
    if (this.countInTimer !== null) window.clearTimeout(this.countInTimer)
    this.recordingTimer = null; this.countInTimer = null
  }

  private transition(next: TransportState, force = false) {
    if (!force && !canTransition(this.state, next)) throw new Error(`Cannot move transport from ${this.state} to ${next}.`)
    this.state = next
    this.publish()
  }

  private publish() { this.listeners.forEach((listener) => listener(this.getSnapshot())) }
}

function scheduleFromLoop(loop: CompositionLoop): TransportSchedule {
  const secondsPerBeat = 60 / loop.metadata.bpm
  const secondsPerBar = secondsPerBeat * 4
  return { secondsPerBeat, secondsPerBar, loopDurationSeconds: loop.metadata.durationSeconds, countInDurationSeconds: 0, countInStartTime: 0, recordingStartTime: 0, recordingEndTime: 0, startFrame: 0, endFrame: loop.metadata.frameCount, expectedFrameCount: loop.metadata.frameCount }
}

function peakOfChannels(channels: Float32Array[]) {
  let peak = 0
  channels.forEach((channel) => {
    for (let frame = 0; frame < channel.length; frame += 1) peak = Math.max(peak, Math.abs(channel[frame]))
  })
  return peak
}
