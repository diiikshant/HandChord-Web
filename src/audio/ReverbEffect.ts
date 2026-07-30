import { clamp } from '../movement/MovementMath.ts'

export const REVERB_DECAY_SECONDS = 6
export const REVERB_SMOOTHING_SECONDS = 0.1

/** A locally generated stereo impulse and a reusable dry/wet Convolver graph. */
export class ReverbEffect {
  readonly input: GainNode
  private readonly dryGain: GainNode
  private readonly wetGain: GainNode
  private readonly convolver: ConvolverNode
  private wet = 0.1
  private readonly context: AudioContext

  constructor(context: AudioContext, destination: AudioNode) {
    this.context = context
    this.input = context.createGain()
    this.dryGain = context.createGain()
    this.wetGain = context.createGain()
    this.convolver = context.createConvolver()
    this.convolver.buffer = createImpulseResponse(context, REVERB_DECAY_SECONDS)
    this.input.connect(this.dryGain).connect(destination)
    this.input.connect(this.convolver).connect(this.wetGain).connect(destination)
    this.applyWet(this.wet, true)
  }

  setWet(value: number) { this.applyWet(clamp(value)) }
  getWet() { return this.wet }
  dispose() { this.input.disconnect(); this.dryGain.disconnect(); this.wetGain.disconnect(); this.convolver.disconnect() }

  private applyWet(value: number, immediate = false) {
    this.wet = value
    const now = this.context.currentTime
    const dry = 1 - value * 0.35 // Keep the direct chord clear and avoid a loudness surge at high wet levels.
    if (immediate) {
      this.dryGain.gain.setValueAtTime(dry, now); this.wetGain.gain.setValueAtTime(value, now)
    } else {
      this.dryGain.gain.setTargetAtTime(dry, now, REVERB_SMOOTHING_SECONDS)
      this.wetGain.gain.setTargetAtTime(value, now, REVERB_SMOOTHING_SECONDS)
    }
  }
}

export function createImpulseResponse(context: AudioContext, durationSeconds: number) {
  const length = Math.floor(context.sampleRate * durationSeconds)
  const buffer = context.createBuffer(2, length, context.sampleRate)
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel)
    for (let index = 0; index < length; index += 1) {
      const progress = index / length
      const decay = (1 - progress) ** (channel === 0 ? 2.3 : 2.8)
      data[index] = (Math.random() * 2 - 1) * decay * 0.28
    }
  }
  return buffer
}
