import assert from 'node:assert/strict'
import test from 'node:test'
import { recogniseHand } from './fingerClassifier.ts'
import { createHandPose } from './gestureFixtures.ts'
import { GestureStabiliser } from './gestureStabiliser.ts'

test('moves a valid candidate to stable only after its confirmation time', () => {
  const stabiliser = new GestureStabiliser()
  const one = recogniseHand(createHandPose({ extended: ['index'] }))

  const initial = stabiliser.update(one, 0)
  const confirming = stabiliser.update(one, 249)
  const stable = stabiliser.update(one, 250)

  assert.equal(initial.displayState, 'hold')
  assert.equal(initial.validationReason, 'candidate still confirming')
  assert.equal(confirming.stableGesture, null)
  assert.equal(stable.stableGesture, 'one')
  assert.equal(stable.stableCount, 1)
})

test('preserves a stable gesture through one unclear frame and then clears it', () => {
  const stabiliser = new GestureStabiliser()
  const one = recogniseHand(createHandPose({ extended: ['index'] }))
  const unclear = recogniseHand(createHandPose({ extended: ['index'], lowVisibility: [7] }))

  stabiliser.update(one, 0)
  stabiliser.update(one, 250)
  const retained = stabiliser.update(unclear, 500)
  const cleared = stabiliser.update(unclear, 800)

  assert.equal(retained.stableGesture, 'one')
  assert.equal(retained.stableCount, 1)
  assert.equal(retained.validationReason, 'required joint missing')
  assert.equal(cleared.stableGesture, null)
  assert.equal(cleared.displayState, 'unclear')
})

test('does not turn an unsupported pattern into a previous stable count', () => {
  const stabiliser = new GestureStabiliser()
  const one = recogniseHand(createHandPose({ extended: ['index'] }))
  const unsupported = recogniseHand(createHandPose({ extended: ['thumb', 'index'] }))

  stabiliser.update(one, 0)
  stabiliser.update(one, 250)
  const result = stabiliser.update(unsupported, 300)

  assert.equal(result.rawExtendedCount, 2)
  assert.equal(result.canonicalGesture, null)
  assert.equal(result.stableGesture, null)
  assert.equal(result.validationReason, 'unsupported finger pattern')
})
