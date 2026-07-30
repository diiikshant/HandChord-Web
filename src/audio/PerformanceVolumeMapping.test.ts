import assert from 'node:assert/strict'
import test from 'node:test'
import { combinedOutputGain, mapRightVerticalToPerformanceGain, PERFORMANCE_DEFAULT_GAIN, PERFORMANCE_MIN_GAIN, resolvePerformanceGain } from './PerformanceVolumeMapping.ts'

test('maps bottom, midpoint, and top to safe performance gain values', () => {
  assert.equal(mapRightVerticalToPerformanceGain(0), PERFORMANCE_MIN_GAIN)
  assert.equal(mapRightVerticalToPerformanceGain(1), 1)
  assert.ok(Math.abs(mapRightVerticalToPerformanceGain(0.5) - 0.5609) < 0.001)
})

test('clamps and remains upward-increasing', () => {
  assert.equal(mapRightVerticalToPerformanceGain(-1), PERFORMANCE_MIN_GAIN)
  assert.equal(mapRightVerticalToPerformanceGain(2), 1)
  assert.ok(mapRightVerticalToPerformanceGain(0.2) < mapRightVerticalToPerformanceGain(0.8))
})

test('uses a safe default when disabled or uncalibrated and combines with manual master gain', () => {
  assert.equal(resolvePerformanceGain(false, true, 1), PERFORMANCE_DEFAULT_GAIN)
  assert.equal(resolvePerformanceGain(true, false, 1), PERFORMANCE_DEFAULT_GAIN)
  assert.equal(combinedOutputGain(0.7, 0.3), 0.21)
})
