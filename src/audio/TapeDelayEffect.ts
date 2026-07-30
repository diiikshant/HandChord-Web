import { clamp } from '../movement/MovementMath.ts'
import type { TapeDelayParameters } from './TapeDelayMapping.ts'
import { TAPE_DELAY_MIN_SECONDS } from './TapeDelayMapping.ts'

export const TAPE_DELAY_WET_SMOOTHING_SECONDS = 0.07
export const TAPE_DELAY_FEEDBACK_SMOOTHING_SECONDS = 0.1
export const TAPE_DELAY_TIME_SMOOTHING_SECONDS = 0.12

/** One reusable, feedback-limited tape-style delay graph that feeds into reverb. */
export class TapeDelayEffect {
  readonly input: GainNode
  private readonly dryGain: GainNode
  private readonly delay: DelayNode
  private readonly toneFilter: BiquadFilterNode
  private readonly feedbackGain: GainNode
  private readonly wetGain: GainNode
  private readonly context: AudioContext
  private parameters: TapeDelayParameters

  constructor(context: AudioContext, destination: AudioNode, initial: TapeDelayParameters) {
    this.context = context
    this.parameters = initial
    this.input = context.createGain()
    this.dryGain = context.createGain()
    this.delay = context.createDelay(1)
    this.toneFilter = context.createBiquadFilter()
    this.feedbackGain = context.createGain()
    this.wetGain = context.createGain()

    this.toneFilter.type = 'lowpass'
    this.toneFilter.Q.setValueAtTime(0.7, context.currentTime)
    this.input.connect(this.dryGain).connect(destination)
    this.input.connect(this.delay).connect(this.toneFilter)
    this.toneFilter.connect(this.wetGain).connect(destination)
    this.toneFilter.connect(this.feedbackGain).connect(this.delay)
    this.apply(initial, true)
  }

  setParameters(parameters: TapeDelayParameters) {
    this.apply(parameters)
  }

  getParameters() {
    return this.parameters
  }

  dispose() {
    this.input.disconnect()
    this.dryGain.disconnect()
    this.delay.disconnect()
    this.toneFilter.disconnect()
    this.feedbackGain.disconnect()
    this.wetGain.disconnect()
  }

  private apply(parameters: TapeDelayParameters, immediate = false) {
    const safe = {
      ...parameters,
      delayTimeSeconds: clamp(parameters.delayTimeSeconds, TAPE_DELAY_MIN_SECONDS, 1),
      wet: clamp(parameters.wet),
      // The public mapping caps feedback at 55%; this second cap keeps the graph safe.
      feedback: clamp(parameters.feedback, 0, 0.6),
      filterCutoffHz: clamp(parameters.filterCutoffHz, 2500, 5000),
    }
    this.parameters = safe
    const now = this.context.currentTime
    const dry = 1 - safe.wet * 0.12
    if (immediate) {
      this.delay.delayTime.setValueAtTime(safe.delayTimeSeconds, now)
      this.wetGain.gain.setValueAtTime(safe.wet, now)
      this.feedbackGain.gain.setValueAtTime(safe.feedback, now)
      this.toneFilter.frequency.setValueAtTime(safe.filterCutoffHz, now)
      this.dryGain.gain.setValueAtTime(dry, now)
      return
    }

    // Smooth all gesture updates so delay-time changes do not click harshly.
    this.delay.delayTime.setTargetAtTime(safe.delayTimeSeconds, now, TAPE_DELAY_TIME_SMOOTHING_SECONDS)
    this.wetGain.gain.setTargetAtTime(safe.wet, now, TAPE_DELAY_WET_SMOOTHING_SECONDS)
    this.feedbackGain.gain.setTargetAtTime(safe.feedback, now, TAPE_DELAY_FEEDBACK_SMOOTHING_SECONDS)
    this.dryGain.gain.setTargetAtTime(dry, now, TAPE_DELAY_WET_SMOOTHING_SECONDS)
  }
}
