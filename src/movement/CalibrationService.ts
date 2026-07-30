import { clearCalibration, loadCalibration, saveCalibration } from './CalibrationStorage.ts'

export type AxisName = 'leftVertical' | 'leftHorizontal' | 'rightVertical' | 'rightHorizontal'
export type CalibrationRange = { minimum: number; maximum: number; isValid: boolean; updatedAt: number | null }
export type CalibrationProfile = Record<AxisName, CalibrationRange>

const AXES: AxisName[] = ['leftVertical', 'leftHorizontal', 'rightVertical', 'rightHorizontal']
const MINIMUM_RANGE = 0.12

function emptyRange(): CalibrationRange {
  return { minimum: 0, maximum: 0, isValid: false, updatedAt: null }
}

export function emptyProfile(): CalibrationProfile {
  return { leftVertical: emptyRange(), leftHorizontal: emptyRange(), rightVertical: emptyRange(), rightHorizontal: emptyRange() }
}

/** One shared service owns all four independent calibration ranges. */
export class CalibrationService {
  private profile: CalibrationProfile
  private readonly listeners = new Set<(profile: CalibrationProfile) => void>()

  constructor() {
    this.profile = loadCalibration() ?? emptyProfile()
  }

  getProfile() { return this.profile }
  subscribe(listener: (profile: CalibrationProfile) => void) {
    this.listeners.add(listener); listener(this.profile); return () => { this.listeners.delete(listener) }
  }
  updateLeftVertical(minimum: number, maximum: number, now = Date.now()) { return this.update('leftVertical', minimum, maximum, now) }
  updateLeftHorizontal(minimum: number, maximum: number, now = Date.now()) { return this.update('leftHorizontal', minimum, maximum, now) }
  updateRightVertical(minimum: number, maximum: number, now = Date.now()) { return this.update('rightVertical', minimum, maximum, now) }
  updateRightHorizontal(minimum: number, maximum: number, now = Date.now()) { return this.update('rightHorizontal', minimum, maximum, now) }
  clear(axis: AxisName) { this.profile = { ...this.profile, [axis]: emptyRange() }; this.persist() }
  clearLeftHand() { this.clearMany(['leftVertical', 'leftHorizontal']) }
  clearRightHand() { this.clearMany(['rightVertical', 'rightHorizontal']) }
  resetAll() { this.profile = emptyProfile(); clearCalibration(); this.notify() }

  private update(axis: AxisName, minimum: number, maximum: number, now: number) {
    const lower = Math.min(minimum, maximum)
    const upper = Math.max(minimum, maximum)
    if (!Number.isFinite(lower) || !Number.isFinite(upper) || upper - lower < MINIMUM_RANGE) {
      return { ok: false as const, reason: 'calibration range too narrow' }
    }
    this.profile = { ...this.profile, [axis]: { minimum: lower, maximum: upper, isValid: true, updatedAt: now } }
    this.persist()
    return { ok: true as const }
  }

  private clearMany(axes: AxisName[]) { this.profile = axes.reduce((next, axis) => ({ ...next, [axis]: emptyRange() }), this.profile); this.persist() }
  private persist() { saveCalibration(this.profile); this.notify() }
  private notify() { this.listeners.forEach((listener) => listener(this.profile)) }
}

export { AXES, MINIMUM_RANGE }
