import assert from 'node:assert/strict'
import test from 'node:test'
import { CalibrationService, emptyProfile } from './CalibrationService.ts'
import { loadCalibration, saveCalibration } from './CalibrationStorage.ts'
import { applyDeadZone, clamp, mapAxis, smoothValue } from './MovementMath.ts'
import { getPalmPosition } from './PalmPositionTracker.ts'

function hand(x: number, y: number) {
  return { handedness: 'Left', confidence: 0.99, landmarks: Array.from({ length: 21 }, () => ({ x, y, z: 0, visibility: 1 })) }
}

test('calculates palm centre and applies the mirrored, upward-positive directions once', () => {
  const palm = getPalmPosition(hand(0.2, 0.8))
  assert.deepEqual(palm, { role: 'left', confidence: 0.99, rawX: 0.8, rawY: 0.19999999999999996 })
})

test('maps ranges, midpoint, clamps, dead zone, and smoothing deterministically', () => {
  assert.equal(mapAxis(0.2, 0.2, 0.8), 0)
  assert.equal(mapAxis(0.8, 0.2, 0.8), 1)
  assert.ok(Math.abs((mapAxis(0.5, 0.2, 0.8) ?? 0) - 0.5) < 0.000001)
  assert.equal(mapAxis(-1, 0.2, 0.8), 0)
  assert.equal(clamp(2), 1)
  assert.equal(applyDeadZone(0.53, 0.5), 0.5)
  assert.equal(applyDeadZone(0.57, 0.5), 0.57)
  assert.equal(smoothValue(0, 1, 0.22), 0.22)
})

test('single-axis and hand recalibration preserve unrelated ranges', () => {
  const service = new CalibrationService()
  service.resetAll()
  assert.equal(service.updateLeftVertical(0.1, 0.9).ok, true)
  assert.equal(service.updateRightHorizontal(0.2, 0.8).ok, true)
  const before = service.getProfile().rightHorizontal
  service.clear('leftVertical')
  assert.equal(service.getProfile().leftVertical.isValid, false)
  assert.deepEqual(service.getProfile().rightHorizontal, before)
  service.updateLeftVertical(0.1, 0.9)
  service.updateLeftHorizontal(0.2, 0.8)
  service.clearLeftHand()
  assert.equal(service.getProfile().leftVertical.isValid, false)
  assert.equal(service.getProfile().leftHorizontal.isValid, false)
  assert.equal(service.getProfile().rightHorizontal.isValid, true)
  service.resetAll()
  assert.deepEqual(service.getProfile(), emptyProfile())
})

test('an invalid range never overwrites a previous valid range', () => {
  const service = new CalibrationService(); service.resetAll(); service.updateRightVertical(0.1, 0.9)
  const valid = service.getProfile().rightVertical
  assert.equal(service.updateRightVertical(0.4, 0.45).ok, false)
  assert.deepEqual(service.getProfile().rightVertical, valid)
})

test('persists valid calibration and safely rejects invalid stored data', () => {
  const store = new Map<string, string>()
  Object.assign(globalThis, { window: { localStorage: { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value), removeItem: (key: string) => store.delete(key) } } })
  const profile = emptyProfile(); profile.leftHorizontal = { minimum: 0.1, maximum: 0.9, isValid: true, updatedAt: 1 }
  saveCalibration(profile)
  assert.deepEqual(loadCalibration(), profile)
  store.set('handchord-movement-calibration-v1', '{"bad":true}')
  assert.equal(loadCalibration(), null)
})
