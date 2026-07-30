import { clamp } from '../movement/MovementMath.ts'

export const PERFORMANCE_MIN_GAIN = 0.2
export const PERFORMANCE_DEFAULT_GAIN = 0.7
export const PERFORMANCE_CURVE_EXPONENT = 1.15

export function mapRightVerticalToPerformanceGain(value: number) {
  return PERFORMANCE_MIN_GAIN + (1 - PERFORMANCE_MIN_GAIN) * clamp(value) ** PERFORMANCE_CURVE_EXPONENT
}

export function resolvePerformanceGain(enabled: boolean, calibrated: boolean, value: number | null) {
  return enabled && calibrated && value !== null ? mapRightVerticalToPerformanceGain(value) : PERFORMANCE_DEFAULT_GAIN
}

export function combinedOutputGain(performanceGain: number, masterGain: number) {
  return clamp(performanceGain) * clamp(masterGain)
}
