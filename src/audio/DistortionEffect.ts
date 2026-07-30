import { clamp } from '../movement/MovementMath.ts'
import { getDistortionMix } from './DistortionMapping.ts'

export const DISTORTION_OVERSAMPLE: OverSampleType = '2x'
export const DISTORTION_SMOOTHING_SECONDS = 0.065

/** A reusable parallel dry / WaveShaper wet path placed before the reverb. */
export class DistortionEffect {
  readonly input: GainNode
  private readonly dryGain: GainNode
  private readonly wetGain: GainNode
  private readonly shaper: WaveShaperNode
  private readonly context: AudioContext
  private wet = 0

  constructor(context: AudioContext, destination: AudioNode) {
    this.context = context
    this.input = context.createGain()
    this.dryGain = context.createGain()
    this.wetGain = context.createGain()
    this.shaper = context.createWaveShaper()
    this.shaper.curve = createWarmDistortionCurve()
    this.shaper.oversample = DISTORTION_OVERSAMPLE

    this.input.connect(this.dryGain).connect(destination)
    this.input.connect(this.shaper).connect(this.wetGain).connect(destination)
    this.applyWet(0, true)
  }

  setWet(value: number) {
    this.applyWet(clamp(value))
  }

  getWet() {
    return this.wet
  }

  dispose() {
    this.input.disconnect()
    this.dryGain.disconnect()
    this.wetGain.disconnect()
    this.shaper.disconnect()
  }

  private applyWet(value: number, immediate = false) {
    this.wet = value
    const mix = getDistortionMix(value)
    const now = this.context.currentTime

    if (immediate) {
      this.dryGain.gain.setValueAtTime(mix.dry, now)
      this.wetGain.gain.setValueAtTime(mix.wet, now)
      return
    }

    // setTargetAtTime smooths frequent tracking updates without rebuilding nodes.
    this.dryGain.gain.setTargetAtTime(mix.dry, now, DISTORTION_SMOOTHING_SECONDS)
    this.wetGain.gain.setTargetAtTime(mix.wet, now, DISTORTION_SMOOTHING_SECONDS)
  }
}

/** A moderate soft-clipping curve suited to sustained polyphonic chords. */
export function createWarmDistortionCurve(size = 2048, amount = 70) {
  const curve = new Float32Array(size)
  const radians = Math.PI / 180
  for (let index = 0; index < size; index += 1) {
    const x = (index * 2) / (size - 1) - 1
    curve[index] = ((3 + amount) * x * 20 * radians) / (Math.PI + amount * Math.abs(x))
  }
  return curve
}
