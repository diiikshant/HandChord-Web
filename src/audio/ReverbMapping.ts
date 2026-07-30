import { clamp } from '../movement/MovementMath.ts'

export const REVERB_MAX_WET = 0.95
export const REVERB_DEFAULT_WET = 0.1

export function mapLeftVerticalToWet(value: number) {
  const normalised = clamp(value)
  return normalised * normalised * REVERB_MAX_WET
}

export function resolveReverbWet(enabled: boolean, calibrated: boolean, value: number | null) {
  if (!enabled || !calibrated || value === null) return REVERB_DEFAULT_WET
  return mapLeftVerticalToWet(value)
}
