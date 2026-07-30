import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CHORUS_DEFAULT_WET,
  CHORUS_MAX_WET,
  getChorusMix,
  mapRightHorizontalToChorusWet,
  resolveChorusWet,
  reverseRightHorizontalForChorus,
} from './ChorusMapping.ts'

test('maps visual-right dry, midpoint moderate, and visual-left maximum with a curved chorus response', () => {
  assert.equal(mapRightHorizontalToChorusWet(1), 0)
  assert.equal(mapRightHorizontalToChorusWet(0), CHORUS_MAX_WET)
  assert.ok(Math.abs(mapRightHorizontalToChorusWet(0.5) - 0.2) < 0.000001)
})

test('clamps and increases as the user-visible hand moves left', () => {
  assert.equal(mapRightHorizontalToChorusWet(-1), CHORUS_MAX_WET)
  assert.equal(mapRightHorizontalToChorusWet(2), 0)
  assert.ok(mapRightHorizontalToChorusWet(0.8) < mapRightHorizontalToChorusWet(0.5))
  assert.ok(mapRightHorizontalToChorusWet(0.5) < mapRightHorizontalToChorusWet(0.2))
  assert.equal(reverseRightHorizontalForChorus(0), 1)
  assert.equal(reverseRightHorizontalForChorus(1), 0)
})

test('uses dry audio when disabled, uncalibrated, or temporarily missing a value', () => {
  assert.equal(resolveChorusWet(false, true, 1), CHORUS_DEFAULT_WET)
  assert.equal(resolveChorusWet(true, false, 1), CHORUS_DEFAULT_WET)
  assert.equal(resolveChorusWet(true, true, null), CHORUS_DEFAULT_WET)
})

test('compensated chorus gains remain within safe limits', () => {
  assert.deepEqual(getChorusMix(0), { dry: 1, wet: 0 })
  const lush = getChorusMix(CHORUS_MAX_WET)
  assert.ok(lush.dry > 0 && lush.dry <= 1)
  assert.ok(lush.wet > 0 && lush.wet < CHORUS_MAX_WET)
})
