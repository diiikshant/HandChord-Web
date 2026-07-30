import { PolySynth } from './PolySynth.ts'
import { ChorusEffect } from './ChorusEffect.ts'
import { DistortionEffect } from './DistortionEffect.ts'
import { ReverbEffect } from './ReverbEffect.ts'
import { TapeDelayEffect } from './TapeDelayEffect.ts'
import { mapRightVerticalToTapeDelay, type TapeDelayParameters } from './TapeDelayMapping.ts'
import { DEFAULT_INSTRUMENT_ID, getInstrument } from './instruments/instrumentPresets.ts'
import type { InstrumentDefinition, InstrumentId } from './instruments/instrumentTypes.ts'
import { SampleInstrument } from './sounds/SampleInstrument.ts'
import { reverseAudioBuffer } from './sounds/sampleMath.ts'
import type { PersonalSound, SoundSource } from './sounds/soundTypes.ts'

export type AudioStatus = 'disabled' | 'starting' | 'ready' | 'suspended' | 'error'

export type AudioSnapshot = {
  status: AudioStatus
  contextState: AudioContextState | 'not-created'
  activeChordId: string | null
  error: string | null
}

export type InputLevelMeter = {
  readLevel: () => number
  dispose: () => void
}

/** The only shared routing exposed to session-only composition recording. */
export type CompositionAudioRouting = {
  context: AudioContext
  recordingTap: AudioNode
  monitoringOutput: AudioNode
}

type AudioContextConstructor = new () => AudioContext

/** Keeps chord identity independent from browser audio nodes for predictable playback. */
export class ChordPlaybackState {
  private activeChordId: string | null = null

  trigger(chordId: string) {
    if (this.activeChordId === chordId) {
      return false
    }

    this.activeChordId = chordId
    return true
  }

  stop() {
    this.activeChordId = null
  }

  get active() {
    return this.activeChordId
  }
}

export class AudioEngine {
  private context: AudioContext | null = null
  private masterGain: GainNode | null = null
  private fixedPerformanceGain: GainNode | null = null
  private performanceRecordingTap: GainNode | null = null
  private synth: PolySynth | null = null
  private sampleInstrument: SampleInstrument | null = null
  private distortion: DistortionEffect | null = null
  private chorus: ChorusEffect | null = null
  private tapeDelay: TapeDelayEffect | null = null
  private reverb: ReverbEffect | null = null
  private distortionWet = 0
  private chorusWet = 0
  private reverbWet = 0.1
  private tapeDelayParameters: TapeDelayParameters = mapRightVerticalToTapeDelay(0)
  private activeInstrument: InstrumentDefinition = getInstrument(DEFAULT_INSTRUMENT_ID)
  private activeSoundSource: SoundSource = { type: 'built-in', instrumentId: DEFAULT_INSTRUMENT_ID }
  private activePersonalSound: PersonalSound | null = null
  private status: AudioStatus = 'disabled'
  private error: string | null = null
  private masterVolume = 1
  private readonly playback = new ChordPlaybackState()
  private readonly listeners = new Set<(snapshot: AudioSnapshot) => void>()

  subscribe(listener: (snapshot: AudioSnapshot) => void) {
    this.listeners.add(listener)
    listener(this.getSnapshot())
    return () => this.listeners.delete(listener)
  }

  getSnapshot(): AudioSnapshot {
    return {
      status: this.status,
      contextState: this.context?.state ?? 'not-created',
      activeChordId: this.playback.active,
      error: this.error,
    }
  }

  async enable() {
    this.status = 'starting'
    this.error = null
    this.notify()

    try {
      this.createContextIfNeeded()
      await this.context?.resume()
      this.updateStatusFromContext()
    } catch (error) {
      this.fail(error, 'Audio could not start.')
      throw error
    }
  }

  async resume() {
    if (!this.context) {
      return this.enable()
    }

    this.status = 'starting'
    this.error = null
    this.notify()
    try {
      await this.context.resume()
      this.updateStatusFromContext()
    } catch (error) {
      this.fail(error, 'Audio could not resume.')
      throw error
    }
  }

  setMasterVolume(volume: number) {
    this.masterVolume = Math.min(1, Math.max(0, volume))
    if (this.masterGain && this.context) {
      this.masterGain.gain.setTargetAtTime(this.masterVolume, this.context.currentTime, 0.02)
    }
  }

  getMasterVolume() { return this.masterVolume }
  getFixedPerformanceGain() { return 1 }
  getActiveInstrument() { return this.activeInstrument }
  getActiveVoiceCount() { return (this.synth?.activeVoiceCount ?? 0) + (this.sampleInstrument?.activeVoiceCount ?? 0) }
  getActiveSoundSource() { return this.activeSoundSource }
  getSamplePlaybackRates() { return this.sampleInstrument?.playbackRates ?? [] }
  getSampleVoiceGroupDiagnostics() { return this.sampleInstrument?.voiceGroupDiagnostics ?? { groupCount: 0, memberVoiceCount: 0, looping: false, sharedDurationSeconds: null, startTime: null, releaseStartTime: null, stopTime: null, naturalVoiceDurations: [] } }

  /**
   * Resumes the existing context from a user action and exposes a tap after all
   * performance effects but before manual volume and final output compression.
   */
  async getCompositionRouting(): Promise<CompositionAudioRouting> {
    if (!this.context) await this.enable()
    else if (this.context.state === 'suspended') await this.resume()
    this.ensureReady()
    if (!this.context || !this.performanceRecordingTap || !this.masterGain) throw new Error('The internal composition recording route is unavailable.')
    return { context: this.context, recordingTap: this.performanceRecordingTap, monitoringOutput: this.masterGain }
  }

  /** Creates analysis-only nodes in the existing AudioContext; it never connects microphone audio to speakers. */
  createInputLevelMeter(stream: MediaStream): InputLevelMeter {
    if (!this.context) throw new Error('Enable Audio before starting the microphone meter.')
    const source = this.context.createMediaStreamSource(stream)
    const analyser = this.context.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)
    const samples = new Uint8Array(analyser.fftSize)
    return {
      readLevel: () => {
        analyser.getByteTimeDomainData(samples)
        let sum = 0
        for (const sample of samples) { const normalised = (sample - 128) / 128; sum += normalised * normalised }
        return Math.min(1, Math.sqrt(sum / samples.length) * 3)
      },
      dispose: () => { source.disconnect(); analyser.disconnect() },
    }
  }

  /** Releases active notes before new voices begin with the selected preset. */
  setInstrument(id: InstrumentId) {
    if (this.activeSoundSource.type === 'built-in' && this.activeInstrument.id === id) return false
    this.stop()
    this.activeInstrument = getInstrument(id)
    this.activeSoundSource = { type: 'built-in', instrumentId: id }
    this.activePersonalSound = null
    this.sampleInstrument?.clearSound()
    this.synth?.setInstrument(this.activeInstrument)
    this.notify()
    return true
  }

  async decodeAudioData(audioData: ArrayBuffer) {
    if (!this.context) throw new Error('Enable Audio before importing a personal sound.')
    try { return await this.context.decodeAudioData(audioData.slice(0)) }
    catch { throw new Error('This audio file could not be decoded by this browser.') }
  }

  setPersonalSound(sound: PersonalSound, buffer: AudioBuffer) {
    this.stop()
    if (!this.sampleInstrument) throw new Error('Enable Audio before selecting a personal sound.')
    this.sampleInstrument.setSound(sound, sound.reverse && this.context ? reverseAudioBuffer(this.context, buffer) : buffer)
    this.activeSoundSource = { type: 'personal-sample', soundId: sound.id }
    this.activePersonalSound = sound
    this.notify()
  }

  previewPersonalSound(sound: PersonalSound, buffer: AudioBuffer) {
    this.ensureReady()
    if (!this.sampleInstrument) throw new Error('The sample playback engine is unavailable.')
    this.stop()
    this.sampleInstrument.preview(sound, sound.reverse && this.context ? reverseAudioBuffer(this.context, buffer) : buffer)
  }

  setDistortionWet(wet: number) {
    this.distortionWet = Math.min(1, Math.max(0, wet))
    this.distortion?.setWet(this.distortionWet)
  }

  getDistortionWet() { return this.distortionWet }

  setChorusWet(wet: number) {
    this.chorusWet = Math.min(1, Math.max(0, wet))
    this.chorus?.setWet(this.chorusWet)
  }

  getChorusWet() { return this.chorusWet }

  hasChorusGraph() { return this.chorus !== null }

  setTapeDelayParameters(parameters: TapeDelayParameters) {
    this.tapeDelayParameters = parameters
    this.tapeDelay?.setParameters(parameters)
  }

  getTapeDelayParameters() { return this.tapeDelayParameters }
  hasTapeDelayGraph() { return this.tapeDelay !== null }

  setReverbWet(wet: number) {
    this.reverbWet = Math.min(1, Math.max(0, wet))
    this.reverb?.setWet(this.reverbWet)
  }

  getReverbWet() { return this.reverbWet }

  playChord(chordId: string, midiNotes: number[]) {
    this.ensureReady()
    const newChord = this.playback.trigger(chordId)
    const repeatOneShot = this.activePersonalSound?.mode === 'one-shot'
    if (!newChord && !repeatOneShot) {
      return false
    }

    try {
      this.synth?.releaseAll()
      this.sampleInstrument?.releaseAll()
      if (this.activeSoundSource.type === 'personal-sample') this.sampleInstrument?.playChord(chordId, midiNotes)
      else this.synth?.playNotes(midiNotes)
      this.notify()
      return true
    } catch (error) {
      this.playback.stop()
      this.fail(error, 'The chord could not be played.')
      throw error
    }
  }

  playTestTone() {
    this.ensureReady()
    this.stop()
    try {
      this.synth?.playNotes([69])
      window.setTimeout(() => this.synth?.releaseAll(), 450)
    } catch (error) {
      this.fail(error, 'The test tone could not be played.')
      throw error
    }
  }

  stop() {
    this.synth?.releaseAll()
    this.sampleInstrument?.releaseAll()
    this.playback.stop()
    this.notify()
  }

  dispose() {
    this.stop()
    this.synth?.dispose()
    this.synth = null
    this.sampleInstrument?.dispose()
    this.sampleInstrument = null
    this.distortion?.dispose()
    this.distortion = null
    this.chorus?.dispose()
    this.chorus = null
    this.tapeDelay?.dispose()
    this.tapeDelay = null
    this.reverb?.dispose()
    this.reverb = null
    this.fixedPerformanceGain?.disconnect()
    this.fixedPerformanceGain = null
    this.performanceRecordingTap?.disconnect()
    this.performanceRecordingTap = null
    this.masterGain?.disconnect()
    this.masterGain = null
    const context = this.context
    this.context = null
    this.status = 'disabled'
    this.error = null
    this.notify()
    if (context && context.state !== 'closed') {
      void context.close()
    }
  }

  private createContextIfNeeded() {
    if (this.context) {
      return
    }
    if (typeof window === 'undefined') {
      throw new Error('Web Audio API is unavailable outside a browser.')
    }

    const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext
    if (!AudioContextClass) {
      throw new Error('This browser does not support the Web Audio API.')
    }

    const context = new AudioContextClass()
    const masterGain = context.createGain()
    const fixedPerformanceGain = context.createGain()
    const performanceRecordingTap = context.createGain()
    const compressor = context.createDynamicsCompressor()
    masterGain.gain.setValueAtTime(this.masterVolume, context.currentTime)
    compressor.threshold.setValueAtTime(-18, context.currentTime)
    compressor.knee.setValueAtTime(18, context.currentTime)
    compressor.ratio.setValueAtTime(8, context.currentTime)
    compressor.attack.setValueAtTime(0.003, context.currentTime)
    compressor.release.setValueAtTime(0.25, context.currentTime)
    fixedPerformanceGain.gain.setValueAtTime(1, context.currentTime)
    // This tap is the internal performance capture point. It excludes the
    // manual master gain and final compressor, and composition playback never
    // connects back here.
    fixedPerformanceGain.connect(performanceRecordingTap).connect(masterGain).connect(compressor).connect(context.destination)

    this.context = context
    this.masterGain = masterGain
    this.fixedPerformanceGain = fixedPerformanceGain
    this.performanceRecordingTap = performanceRecordingTap
    this.reverb = new ReverbEffect(context, fixedPerformanceGain)
    this.reverb.setWet(this.reverbWet)
    this.tapeDelay = new TapeDelayEffect(context, this.reverb.input, this.tapeDelayParameters)
    this.chorus = new ChorusEffect(context, this.tapeDelay.input)
    this.chorus.setWet(this.chorusWet)
    this.distortion = new DistortionEffect(context, this.chorus.input)
    this.distortion.setWet(this.distortionWet)
    this.synth = new PolySynth(context, this.distortion.input, this.activeInstrument)
    this.sampleInstrument = new SampleInstrument(context, this.distortion.input)
    context.onstatechange = () => this.updateStatusFromContext()
  }

  private ensureReady() {
    if (!this.context) {
      this.error = 'Enable Audio before playing a chord.'
      this.notify()
      throw new Error(this.error)
    }
    if (this.context.state !== 'running') {
      this.updateStatusFromContext()
      this.error = 'Audio is suspended. Resume Audio before playing a chord.'
      this.notify()
      throw new Error(this.error)
    }
  }

  private updateStatusFromContext() {
    if (!this.context) {
      this.status = 'disabled'
    } else if (this.context.state === 'running') {
      this.status = 'ready'
    } else if (this.context.state === 'suspended') {
      this.status = 'suspended'
    } else {
      this.status = 'error'
      this.error = 'The audio context was closed.'
    }
    this.notify()
  }

  private fail(error: unknown, fallback: string) {
    this.status = 'error'
    this.error = error instanceof Error ? error.message : fallback
    this.notify()
  }

  private notify() {
    const snapshot = this.getSnapshot()
    this.listeners.forEach((listener) => listener(snapshot))
  }
}
