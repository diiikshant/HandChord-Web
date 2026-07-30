import { clamp } from '../movement/MovementMath.ts'

/** The first distortion control deliberately stops short of fully wet. */
export const DISTORTION_MAX_WET = 0.7
export const DISTORTION_DEFAULT_WET = 0

export type DistortionMix = {
  dry: number
  wet: number
}

/**
 * A squared response leaves more physical movement available for subtle drive,
 * then becomes stronger near the calibrated visual-right position.
 */
export function mapLeftHorizontalToDistortionWet(value: number) {
  const normalised = clamp(value)
  return normalised * normalised * DISTORTION_MAX_WET
}

export function resolveDistortionWet(enabled: boolean, calibrated: boolean, value: number | null) {
  if (!enabled || !calibrated || value === null) return DISTORTION_DEFAULT_WET
  return mapLeftHorizontalToDistortionWet(value)
}

/**
 * Keep some direct signal and attenuate the shaped path slightly. This modest
 * compensation avoids a large loudness rise when a sustained chord is driven.
 */
export function getDistortionMix(value: number): DistortionMix {
  const wet = clamp(value)
  return {
    dry: 1 - wet * 0.25,
    wet: wet * 0.8,
  }
}
