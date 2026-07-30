import type { CalibrationProfile } from './CalibrationService.ts'

const STORAGE_KEY = 'handchord-movement-calibration-v1'

export function loadCalibration(): CalibrationProfile | null {
  try {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    return isCalibrationProfile(value) ? value : null
  } catch {
    return null
  }
}

export function saveCalibration(profile: CalibrationProfile) {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
  } catch {
    // Storage can be unavailable in private or locked-down browser contexts.
  }
}

export function clearCalibration() {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing else needs to happen if browser storage is unavailable.
  }
}

function isRange(value: unknown): value is { minimum: number; maximum: number; isValid: boolean; updatedAt: number | null } {
  if (!value || typeof value !== 'object') return false
  const range = value as Record<string, unknown>
  return typeof range.minimum === 'number' && typeof range.maximum === 'number' &&
    typeof range.isValid === 'boolean' && (typeof range.updatedAt === 'number' || range.updatedAt === null) &&
    (!range.isValid || range.maximum - range.minimum >= 0.12)
}

function isCalibrationProfile(value: unknown): value is CalibrationProfile {
  if (!value || typeof value !== 'object') return false
  const profile = value as Record<string, unknown>
  return isRange(profile.leftVertical) && isRange(profile.leftHorizontal) &&
    isRange(profile.rightVertical) && isRange(profile.rightHorizontal)
}
