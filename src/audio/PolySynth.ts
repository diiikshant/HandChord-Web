import { midiToFrequency } from '../music/MusicTheoryEngine.ts'
import { applyInstrumentOctave, getInstrument } from './instruments/instrumentPresets.ts'
import type { InstrumentDefinition, InstrumentId } from './instruments/instrumentTypes.ts'

type Voice = {
  gain: GainNode
  filter: BiquadFilterNode
  oscillators: OscillatorNode[]
  releaseSeconds: number
}

/** A small polyphonic synth. It only receives notes from AudioEngine. */
export class PolySynth {
  private readonly voices = new Map<number, Voice>()
  private readonly context: AudioContext
  private readonly output: AudioNode
  private readonly maximumVoices: number
  private instrument: InstrumentDefinition

  constructor(context: AudioContext, output: AudioNode, instrument: InstrumentDefinition = getInstrument('warm-pad'), maximumVoices = 6) {
    this.context = context
    this.output = output
    this.instrument = instrument
    this.maximumVoices = maximumVoices
  }

  setInstrument(instrument: InstrumentDefinition) {
    this.releaseAll()
    this.instrument = instrument
  }

  getInstrumentId(): InstrumentId { return this.instrument.id }
  get activeVoiceCount() { return this.voices.size }

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
    const playableMidiNote = applyInstrumentOctave(midiNote, this.instrument)
    const frequency = midiToFrequency(playableMidiNote)
    if (!Number.isFinite(frequency) || frequency <= 0) {
      throw new Error('The requested note does not have a valid frequency.')
    }

    const now = this.context.currentTime
    const voiceGain = this.context.createGain()
    const filter = this.context.createBiquadFilter()
    const { envelope } = this.instrument
    const peakGain = this.instrument.gainCompensation
    const sustainGain = Math.max(0.0001, peakGain * envelope.sustainLevel)
    voiceGain.gain.setValueAtTime(0.0001, now)
    voiceGain.gain.exponentialRampToValueAtTime(peakGain, now + envelope.attackSeconds)
    voiceGain.gain.exponentialRampToValueAtTime(sustainGain, now + envelope.attackSeconds + envelope.decaySeconds)
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(this.instrument.filter.frequencyHz, now)
    filter.Q.setValueAtTime(this.instrument.filter.q, now)

    const oscillators = this.instrument.oscillators.map((layer) => {
      const oscillator = this.context.createOscillator()
      const layerGain = this.context.createGain()
      oscillator.type = layer.waveform
      oscillator.frequency.setValueAtTime(frequency, now)
      oscillator.detune.setValueAtTime(layer.detuneCents, now)
      layerGain.gain.setValueAtTime(layer.level, now)
      oscillator.connect(layerGain).connect(filter)
      oscillator.start(now)
      return oscillator
    })
    filter.connect(voiceGain).connect(this.output)
    const voice = { gain: voiceGain, filter, oscillators, releaseSeconds: envelope.releaseSeconds }
    this.voices.set(midiNote, voice)
    if (this.instrument.autoReleaseSeconds !== undefined) {
      window.setTimeout(() => {
        if (this.voices.get(midiNote) !== voice) return
        this.releaseVoice(voice, this.context.currentTime)
        this.voices.delete(midiNote)
      }, this.instrument.autoReleaseSeconds * 1000)
    }
  }

  private releaseVoice(voice: Voice, releaseTime: number) {
    voice.gain.gain.cancelScheduledValues(releaseTime)
    voice.gain.gain.setValueAtTime(Math.max(voice.gain.gain.value, 0.0001), releaseTime)
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, releaseTime + voice.releaseSeconds)

    voice.oscillators.forEach((oscillator) => {
      oscillator.stop(releaseTime + voice.releaseSeconds + 0.03)
      oscillator.onended = () => oscillator.disconnect()
    })
    window.setTimeout(() => { voice.filter.disconnect(); voice.gain.disconnect() }, (voice.releaseSeconds + 0.08) * 1000)
  }
}
