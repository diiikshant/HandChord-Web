import { clamp } from '../movement/MovementMath.ts'

export const CHORUS_MAX_WET = 0.8
export const CHORUS_DEFAULT_WET = 0

export type ChorusMix = { dry: number; wet: number }

/**
 * Keep the movement diagnostic in its normal direction, but make inward
 * (visual-left) movement increase only the chorus input for better ergonomics.
 */
export function reverseRightHorizontalForChorus(value: number) {
  return 1 - clamp(value)
}

/** Squaring leaves room for subtle width before the lush visual-left range. */
export function mapRightHorizontalToChorusWet(value: number) {
  const reversed = reverseRightHorizontalForChorus(value)
  return reversed * reversed * CHORUS_MAX_WET
}

export function resolveChorusWet(enabled: boolean, calibrated: boolean, value: number | null) {
  return enabled && calibrated && value !== null
    ? mapRightHorizontalToChorusWet(value)
    : CHORUS_DEFAULT_WET
}

/** Preserve the clean signal and leave headroom for the existing compressor. */
export function getChorusMix(value: number): ChorusMix {
  const wet = clamp(value)
  return {
    dry: 1 - wet * 0.2,
    wet: wet * 0.7,
  }
}
