import assert from 'node:assert/strict'
import test from 'node:test'
import { mapLeftVerticalToWet, REVERB_DEFAULT_WET, REVERB_MAX_WET, resolveReverbWet } from './ReverbMapping.ts'

test('maps bottom, midpoint, and top with a curved reverb response', () => {
  assert.equal(mapLeftVerticalToWet(0), 0)
  assert.equal(mapLeftVerticalToWet(1), REVERB_MAX_WET)
  assert.ok(Math.abs(mapLeftVerticalToWet(0.5) - REVERB_MAX_WET * 0.25) < 0.000001)
})

test('clamps and remains monotonic', () => {
  assert.equal(mapLeftVerticalToWet(-2), 0)
  assert.equal(mapLeftVerticalToWet(2), REVERB_MAX_WET)
  assert.ok(mapLeftVerticalToWet(0.2) < mapLeftVerticalToWet(0.5))
  assert.ok(mapLeftVerticalToWet(0.5) < mapLeftVerticalToWet(0.8))
})

test('uses a safe default for missing calibration and when control is off', () => {
  assert.equal(resolveReverbWet(true, false, 0.8), REVERB_DEFAULT_WET)
  assert.equal(resolveReverbWet(false, true, 0.8), REVERB_DEFAULT_WET)
})
