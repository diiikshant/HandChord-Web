import { midiToFrequency } from '../music/MusicTheoryEngine.ts'

export const SYNTH_ENVELOPE = {
  attackSeconds: 0.03,
  sustainGain: 0.12,
  releaseSeconds: 0.2,
} as const

type Voice = {
  gain: GainNode
  oscillators: OscillatorNode[]
}

/** A small polyphonic synth. It only receives notes from AudioEngine. */
export class PolySynth {
  private readonly voices = new Map<number, Voice>()
  private readonly context: AudioContext
  private readonly output: AudioNode
  private readonly maximumVoices: number

  constructor(context: AudioContext, output: AudioNode, maximumVoices = 6) {
    this.context = context
    this.output = output
    this.maximumVoices = maximumVoices
  }

  playNotes(midiNotes: number[]) {
    const uniqueNotes = [...new Set(midiNotes)]
    if (uniqueNotes.length > this.maximumVoices) {
      throw new Error(`This synth supports up to ${this.maximumVoices} notes at one time.`)
    }

    uniqueNotes.forEach((midiNote) => this.startVoice(midiNote))
  }

  releaseAll() {
    const releaseTime = this.context.currentTime
    this.voices.forEach((voice) => this.releaseVoice(voice, releaseTime))
    this.voices.clear()
  }

  dispose() {
    this.releaseAll()
  }

  private startVoice(midiNote: number) {
    const frequency = midiToFrequency(midiNote)
    if (!Number.isFinite(frequency) || frequency <= 0) {
      throw new Error('The requested note does not have a valid frequency.')
    }

    const now = this.context.currentTime
    const voiceGain = this.context.createGain()
    const mainOscillator = this.context.createOscillator()
    const warmthOscillator = this.context.createOscillator()
    voiceGain.gain.setValueAtTime(0.0001, now)
    voiceGain.gain.exponentialRampToValueAtTime(SYNTH_ENVELOPE.sustainGain, now + SYNTH_ENVELOPE.attackSeconds)

    mainOscillator.type = 'triangle'
    mainOscillator.frequency.setValueAtTime(frequency, now)
    warmthOscillator.type = 'sine'
    warmthOscillator.frequency.setValueAtTime(frequency, now)
    warmthOscillator.detune.setValueAtTime(7, now)

    const warmthGain = this.context.createGain()
    warmthGain.gain.setValueAtTime(0.35, now)
    mainOscillator.connect(voiceGain)
    warmthOscillator.connect(warmthGain).connect(voiceGain)
    voiceGain.connect(this.output)
    mainOscillator.start(now)
    warmthOscillator.start(now)
    this.voices.set(midiNote, { gain: voiceGain, oscillators: [mainOscillator, warmthOscillator] })
  }

  private releaseVoice(voice: Voice, releaseTime: number) {
    voice.gain.gain.cancelScheduledValues(releaseTime)
    voice.gain.gain.setValueAtTime(Math.max(voice.gain.gain.value, 0.0001), releaseTime)
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, releaseTime + SYNTH_ENVELOPE.releaseSeconds)

    voice.oscillators.forEach((oscillator) => {
      oscillator.stop(releaseTime + SYNTH_ENVELOPE.releaseSeconds + 0.03)
      oscillator.onended = () => oscillator.disconnect()
    })
    window.setTimeout(() => voice.gain.disconnect(), (SYNTH_ENVELOPE.releaseSeconds + 0.08) * 1000)
  }
}
