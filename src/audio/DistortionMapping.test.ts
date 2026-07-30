import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DISTORTION_DEFAULT_WET,
  DISTORTION_MAX_WET,
  getDistortionMix,
  mapLeftHorizontalToDistortionWet,
  resolveDistortionWet,
} from './DistortionMapping.ts'

test('maps the visual-left, midpoint, and visual-right limits with a curved response', () => {
  assert.equal(mapLeftHorizontalToDistortionWet(0), 0)
  assert.equal(mapLeftHorizontalToDistortionWet(1), DISTORTION_MAX_WET)
  assert.ok(Math.abs(mapLeftHorizontalToDistortionWet(0.5) - 0.175) < 0.000001)
})

test('clamps and increases as the visible hand moves right', () => {
  assert.equal(mapLeftHorizontalToDistortionWet(-1), 0)
  assert.equal(mapLeftHorizontalToDistortionWet(2), DISTORTION_MAX_WET)
  assert.ok(mapLeftHorizontalToDistortionWet(0.2) < mapLeftHorizontalToDistortionWet(0.5))
  assert.ok(mapLeftHorizontalToDistortionWet(0.5) < mapLeftHorizontalToDistortionWet(0.8))
})

test('uses clean audio when the control is disabled or calibration is missing', () => {
  assert.equal(resolveDistortionWet(false, true, 1), DISTORTION_DEFAULT_WET)
  assert.equal(resolveDistortionWet(true, false, 1), DISTORTION_DEFAULT_WET)
  assert.equal(resolveDistortionWet(true, true, null), DISTORTION_DEFAULT_WET)
})

test('gain compensation stays within safe dry and wet limits', () => {
  const clean = getDistortionMix(0)
  const driven = getDistortionMix(DISTORTION_MAX_WET)
  assert.deepEqual(clean, { dry: 1, wet: 0 })
  assert.ok(driven.dry > 0 && driven.dry <= 1)
  assert.ok(driven.wet > 0 && driven.wet < DISTORTION_MAX_WET)
})
