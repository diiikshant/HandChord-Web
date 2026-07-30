import assert from 'node:assert/strict'
import test from 'node:test'
import {
  mapRightVerticalToTapeDelay,
  resolveTapeDelayParameters,
  TAPE_DELAY_FILTER_CUTOFF_HZ,
  TAPE_DELAY_MAX_FEEDBACK,
  TAPE_DELAY_MAX_SECONDS,
  TAPE_DELAY_MAX_WET,
  TAPE_DELAY_MIN_SECONDS,
} from './TapeDelayMapping.ts'

test('maps the lower, midpoint, and upper right-hand positions to tape-delay parameters', () => {
  const lower = mapRightVerticalToTapeDelay(0)
  const midpoint = mapRightVerticalToTapeDelay(0.5)
  const upper = mapRightVerticalToTapeDelay(1)
  assert.equal(lower.delayTimeSeconds, TAPE_DELAY_MIN_SECONDS)
  assert.equal(lower.wet, 0)
  assert.equal(lower.feedback, 0)
  assert.equal(upper.delayTimeSeconds, TAPE_DELAY_MAX_SECONDS)
  assert.equal(upper.wet, TAPE_DELAY_MAX_WET)
  assert.equal(upper.feedback, TAPE_DELAY_MAX_FEEDBACK)
  assert.equal(midpoint.curved, 0.25)
  assert.ok(midpoint.delayTimeSeconds >= 0.25 && midpoint.delayTimeSeconds <= 0.4)
  assert.ok(midpoint.wet >= 0.19 && midpoint.wet <= 0.35)
  assert.ok(midpoint.feedback >= 0.2 && midpoint.feedback <= 0.35)
})

test('increases upward, clamps safely, and never allows unsafe feedback', () => {
  const below = mapRightVerticalToTapeDelay(-1)
  const above = mapRightVerticalToTapeDelay(2)
  const low = mapRightVerticalToTapeDelay(0.2)
  const high = mapRightVerticalToTapeDelay(0.8)
  assert.deepEqual(below, mapRightVerticalToTapeDelay(0))
  assert.deepEqual(above, mapRightVerticalToTapeDelay(1))
  assert.ok(low.wet < high.wet)
  assert.ok(low.feedback < high.feedback)
  assert.ok(above.feedback < 1)
  assert.equal(above.filterCutoffHz, TAPE_DELAY_FILTER_CUTOFF_HZ)
})

test('returns a dry, zero-feedback delay when disabled or uncalibrated', () => {
  const disabled = resolveTapeDelayParameters(false, true, 1)
  const missingCalibration = resolveTapeDelayParameters(true, false, 1)
  assert.equal(disabled.wet, 0)
  assert.equal(disabled.feedback, 0)
  assert.equal(missingCalibration.wet, 0)
  assert.equal(missingCalibration.feedback, 0)
})
