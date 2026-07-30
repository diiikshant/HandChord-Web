import { clamp } from '../movement/MovementMath.ts'
import { getChorusMix } from './ChorusMapping.ts'

export const CHORUS_BASE_DELAY_SECONDS = 0.018
export const CHORUS_MODULATION_DEPTH_SECONDS = 0.0025
export const CHORUS_LEFT_RATE_HZ = 0.25
export const CHORUS_RIGHT_RATE_HZ = 0.33
export const CHORUS_SMOOTHING_SECONDS = 0.075

/**
 * A reusable, feedback-free stereo chorus. Two delayed copies receive subtly
 * different low-frequency modulation, while the dry path stays available.
 */
export class ChorusEffect {
  readonly input: GainNode
  private readonly dryGain: GainNode
  private readonly wetGain: GainNode
  private readonly leftDelay: DelayNode
  private readonly rightDelay: DelayNode
  private readonly leftLfo: OscillatorNode
  private readonly rightLfo: OscillatorNode
  private readonly leftDepth: GainNode
  private readonly rightDepth: GainNode
  private readonly merger: ChannelMergerNode
  private readonly context: AudioContext
  private wet = 0

  constructor(context: AudioContext, destination: AudioNode) {
    this.context = context
    this.input = context.createGain()
    this.dryGain = context.createGain()
    this.wetGain = context.createGain()
    this.leftDelay = context.createDelay(0.05)
    this.rightDelay = context.createDelay(0.05)
    this.leftLfo = context.createOscillator()
    this.rightLfo = context.createOscillator()
    this.leftDepth = context.createGain()
    this.rightDepth = context.createGain()
    this.merger = context.createChannelMerger(2)

    this.leftDelay.delayTime.setValueAtTime(CHORUS_BASE_DELAY_SECONDS, context.currentTime)
    this.rightDelay.delayTime.setValueAtTime(CHORUS_BASE_DELAY_SECONDS, context.currentTime)
    this.leftLfo.type = 'sine'
    this.rightLfo.type = 'sine'
    this.leftLfo.frequency.setValueAtTime(CHORUS_LEFT_RATE_HZ, context.currentTime)
    this.rightLfo.frequency.setValueAtTime(CHORUS_RIGHT_RATE_HZ, context.currentTime)
    this.leftDepth.gain.setValueAtTime(CHORUS_MODULATION_DEPTH_SECONDS, context.currentTime)
    this.rightDepth.gain.setValueAtTime(CHORUS_MODULATION_DEPTH_SECONDS, context.currentTime)

    this.input.connect(this.dryGain).connect(destination)
    this.input.connect(this.leftDelay).connect(this.merger, 0, 0)
    this.input.connect(this.rightDelay).connect(this.merger, 0, 1)
    this.merger.connect(this.wetGain).connect(destination)
    this.leftLfo.connect(this.leftDepth).connect(this.leftDelay.delayTime)
    this.rightLfo.connect(this.rightDepth).connect(this.rightDelay.delayTime)

    // The modulation oscillators are started once with the single shared AudioContext.
    this.leftLfo.start()
    this.rightLfo.start()
    this.applyWet(0, true)
  }

  setWet(value: number) {
    this.applyWet(clamp(value))
  }

  getWet() {
    return this.wet
  }

  dispose() {
    this.leftLfo.stop()
    this.rightLfo.stop()
    this.input.disconnect()
    this.dryGain.disconnect()
    this.wetGain.disconnect()
    this.leftDelay.disconnect()
    this.rightDelay.disconnect()
    this.leftLfo.disconnect()
    this.rightLfo.disconnect()
    this.leftDepth.disconnect()
    this.rightDepth.disconnect()
    this.merger.disconnect()
  }

  private applyWet(value: number, immediate = false) {
    this.wet = value
    const mix = getChorusMix(value)
    const now = this.context.currentTime
    if (immediate) {
      this.dryGain.gain.setValueAtTime(mix.dry, now)
      this.wetGain.gain.setValueAtTime(mix.wet, now)
      return
    }

    // Schedule one smooth mix update; tracking frames never create a new graph.
    this.dryGain.gain.setTargetAtTime(mix.dry, now, CHORUS_SMOOTHING_SECONDS)
    this.wetGain.gain.setTargetAtTime(mix.wet, now, CHORUS_SMOOTHING_SECONDS)
  }
}
