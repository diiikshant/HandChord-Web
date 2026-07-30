import assert from 'node:assert/strict'
import test from 'node:test'
import { getContainRect, normalizedPointToCanvas } from './overlayGeometry.ts'

const squareVideoInWideStage = getContainRect(
  { width: 1600, height: 900 },
  { width: 1000, height: 1000 },
)

test('calculates letterbox offsets for contain sizing', () => {
  assert.deepEqual(squareVideoInWideStage, { x: 350, y: 0, width: 900, height: 900 })
})

test('keeps the centre point centred after mirroring', () => {
  assert.deepEqual(
    normalizedPointToCanvas({ x: 0.5, y: 0.5 }, squareVideoInWideStage),
    { x: 800, y: 450 },
  )
})

test('maps every normalised corner into the fitted video rectangle', () => {
  assert.deepEqual(
    normalizedPointToCanvas({ x: 0, y: 0 }, squareVideoInWideStage),
    { x: 1250, y: 0 },
  )
  assert.deepEqual(
    normalizedPointToCanvas({ x: 1, y: 0 }, squareVideoInWideStage),
    { x: 350, y: 0 },
  )
  assert.deepEqual(
    normalizedPointToCanvas({ x: 0, y: 1 }, squareVideoInWideStage),
    { x: 1250, y: 900 },
  )
  assert.deepEqual(
    normalizedPointToCanvas({ x: 1, y: 1 }, squareVideoInWideStage),
    { x: 350, y: 900 },
  )
})

test('supports aspect ratios that letterbox above and below', () => {
  assert.deepEqual(
    getContainRect({ width: 900, height: 1600 }, { width: 1600, height: 900 }),
    { x: 0, y: 546.875, width: 900, height: 506.25 },
  )
})
