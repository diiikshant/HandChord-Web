import { clamp } from '../movement/MovementMath.ts'

export const TAPE_DELAY_MIN_SECONDS = 0.1
export const TAPE_DELAY_MAX_SECONDS = 0.7
export const TAPE_DELAY_MAX_WET = 0.65
export const TAPE_DELAY_MAX_FEEDBACK = 0.55
export const TAPE_DELAY_FILTER_CUTOFF_HZ = 3500

export type TapeDelayParameters = {
  normalised: number
  curved: number
  delayTimeSeconds: number
  wet: number
  feedback: number
  filterCutoffHz: number
}

const OFF_PARAMETERS: TapeDelayParameters = {
  normalised: 0,
  curved: 0,
  delayTimeSeconds: TAPE_DELAY_MIN_SECONDS,
  wet: 0,
  feedback: 0,
  filterCutoffHz: TAPE_DELAY_FILTER_CUTOFF_HZ,
}

/** Maps upward right-hand movement into conservative, musical tape-delay parameters. */
export function mapRightVerticalToTapeDelay(value: number): TapeDelayParameters {
  const normalised = clamp(value)
  const curved = normalised ** 2
  // Keep the lower half subtle while still making the midpoint musically useful.
  const timeAndWetCurve = curved * 0.8 + normalised * 0.2
  const feedbackCurve = curved * 0.5 + normalised * 0.5
  return {
    normalised,
    curved,
    delayTimeSeconds: TAPE_DELAY_MIN_SECONDS + (TAPE_DELAY_MAX_SECONDS - TAPE_DELAY_MIN_SECONDS) * timeAndWetCurve,
    wet: TAPE_DELAY_MAX_WET * timeAndWetCurve,
    feedback: TAPE_DELAY_MAX_FEEDBACK * feedbackCurve,
    filterCutoffHz: TAPE_DELAY_FILTER_CUTOFF_HZ,
  }
}

export function resolveTapeDelayParameters(enabled: boolean, calibrated: boolean, value: number | null) {
  return enabled && calibrated && value !== null
    ? mapRightVerticalToTapeDelay(value)
    : OFF_PARAMETERS
}
