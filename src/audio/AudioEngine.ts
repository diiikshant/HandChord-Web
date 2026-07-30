import { PolySynth } from './PolySynth.ts'

export type AudioStatus = 'disabled' | 'starting' | 'ready' | 'suspended' | 'error'

export type AudioSnapshot = {
  status: AudioStatus
  contextState: AudioContextState | 'not-created'
  activeChordId: string | null
  error: string | null
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
  private synth: PolySynth | null = null
  private status: AudioStatus = 'disabled'
  private error: string | null = null
  private masterVolume = 0.3
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

  playChord(chordId: string, midiNotes: number[]) {
    this.ensureReady()
    if (!this.playback.trigger(chordId)) {
      return false
    }

    try {
      this.synth?.releaseAll()
      this.synth?.playNotes(midiNotes)
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
    this.playback.stop()
    this.notify()
  }

  dispose() {
    this.stop()
    this.synth?.dispose()
    this.synth = null
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
    const compressor = context.createDynamicsCompressor()
    masterGain.gain.setValueAtTime(this.masterVolume, context.currentTime)
    compressor.threshold.setValueAtTime(-18, context.currentTime)
    compressor.knee.setValueAtTime(18, context.currentTime)
    compressor.ratio.setValueAtTime(8, context.currentTime)
    compressor.attack.setValueAtTime(0.003, context.currentTime)
    compressor.release.setValueAtTime(0.25, context.currentTime)
    masterGain.connect(compressor).connect(context.destination)

    this.context = context
    this.masterGain = masterGain
    this.synth = new PolySynth(context, masterGain)
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
