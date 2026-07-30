import assert from 'node:assert/strict'
import test from 'node:test'
import { recogniseHand } from './fingerClassifier.ts'
import { createHandPose } from './gestureFixtures.ts'

function statesFor(extended: string[]) {
  return {
    thumb: extended.includes('thumb') ? 'extended' : 'folded',
    index: extended.includes('index') ? 'extended' : 'folded',
    middle: extended.includes('middle') ? 'extended' : 'folded',
    ring: extended.includes('ring') ? 'extended' : 'folded',
    little: extended.includes('little') ? 'extended' : 'folded',
  }
}

test('recognises a fist and allows an occluded fingertip when joints are folded', () => {
  const fist = recogniseHand(createHandPose({ occludedTips: [8, 12] }))

  assert.deepEqual(fist.fingers, statesFor([]))
  assert.equal(fist.rawExtendedCount, 0)
  assert.equal(fist.canonicalGesture, 'fist')
  assert.equal(fist.reason, null)
})

test('recognises a fist when the tucked thumb rests across the curled fingers', () => {
  const fist = createHandPose()

  // A real fist thumb may lie across the fingers instead of making two sharp
  // bends. It is compact and does not point far out from the local palm.
  fist.landmarks[1] = { x: 0.48, y: 0.32, z: 0, visibility: 1 }
  fist.landmarks[2] = { x: 0.7, y: 0.55, z: 0, visibility: 1 }
  fist.landmarks[3] = { x: 0.5, y: 0.82, z: 0, visibility: 1 }
  fist.landmarks[4] = { x: 0.2, y: 1.05, z: 0, visibility: 1 }

  const recognised = recogniseHand(fist)

  assert.equal(recognised.fingers.thumb, 'folded')
  assert.equal(recognised.rawExtendedCount, 0)
  assert.equal(recognised.canonicalGesture, 'fist')
})

test('recognises index only through four long fingers', () => {
  const one = recogniseHand(createHandPose({ extended: ['index'] }))
  const two = recogniseHand(createHandPose({ extended: ['index', 'middle'] }))
  const three = recogniseHand(createHandPose({ extended: ['index', 'middle', 'ring'] }))
  const four = recogniseHand(createHandPose({ extended: ['index', 'middle', 'ring', 'little'] }))

  assert.equal(one.canonicalGesture, 'one')
  assert.equal(one.rawExtendedCount, 1)
  assert.equal(two.canonicalGesture, 'two')
  assert.equal(two.rawExtendedCount, 2)
  assert.equal(three.canonicalGesture, 'three')
  assert.equal(three.rawExtendedCount, 3)
  assert.equal(four.canonicalGesture, 'four')
  assert.equal(four.rawExtendedCount, 4)
  assert.equal(four.fingers.thumb, 'folded')
})

test('recognises an open palm, including a slightly rotated hand', () => {
  const palm = recogniseHand(
    createHandPose({ extended: ['thumb', 'index', 'middle', 'ring', 'little'], rotationRadians: 0.2 }),
  )

  assert.deepEqual(palm.fingers, statesFor(['thumb', 'index', 'middle', 'ring', 'little']))
  assert.equal(palm.rawExtendedCount, 5)
  assert.equal(palm.canonicalGesture, 'open-palm')
})

test('keeps a naturally bent, diagonally splayed open thumb extended', () => {
  const hand = createHandPose({ extended: ['thumb', 'index', 'middle', 'ring', 'little'] })

  // A common open-palm thumb is not ruler-straight: its final joint can point
  // diagonally while it is still clearly separated from the palm.
  hand.landmarks[3] = { x: 1.2, y: 0.52, z: 0, visibility: 1 }
  hand.landmarks[4] = { x: 1.34, y: 0.85, z: 0, visibility: 1 }

  const palm = recogniseHand(hand)

  assert.equal(palm.fingers.thumb, 'extended')
  assert.equal(palm.rawExtendedCount, 5)
  assert.equal(palm.canonicalGesture, 'open-palm')
})

test('keeps raw count separate from an unsupported thumb plus index pattern', () => {
  const unsupported = recogniseHand(createHandPose({ extended: ['thumb', 'index'] }))

  assert.equal(unsupported.rawExtendedCount, 2)
  assert.equal(unsupported.canonicalGesture, null)
  assert.equal(unsupported.reason, 'unsupported finger pattern')
})

test('returns unclear rather than guessing when landmark confidence is low', () => {
  const uncertain = recogniseHand(createHandPose({ extended: ['index'], lowVisibility: [7] }))

  assert.equal(uncertain.fingers.index, 'unclear')
  assert.equal(uncertain.rawExtendedCount, null)
  assert.equal(uncertain.canonicalGesture, null)
  assert.equal(uncertain.reason, 'required joint missing')
})

test('treats zero-valued unreported MediaPipe visibility as usable landmarks', () => {
  const hand = createHandPose({ extended: ['thumb', 'index', 'middle', 'ring', 'little'] })
  hand.landmarks.forEach((landmark) => {
    landmark.visibility = 0
  })

  const palm = recogniseHand(hand)

  assert.equal(palm.canonicalGesture, 'open-palm')
  assert.equal(palm.rawExtendedCount, 5)
})

test('uses handedness for both anatomical hands and leaves low confidence unresolved', () => {
  const leftPalm = recogniseHand(createHandPose({ handedness: 'Left', extended: ['thumb', 'index', 'middle', 'ring', 'little'] }))
  const rightPalm = recogniseHand(createHandPose({ handedness: 'Right', extended: ['thumb', 'index', 'middle', 'ring', 'little'] }))
  const unresolved = recogniseHand(createHandPose({ extended: ['index'], confidence: 0.4 }))

  assert.equal(leftPalm.role, 'left')
  assert.equal(leftPalm.canonicalGesture, 'open-palm')
  assert.equal(rightPalm.role, 'right')
  assert.equal(rightPalm.canonicalGesture, 'open-palm')
  assert.equal(unresolved.role, 'unresolved')
  assert.equal(unresolved.reason, 'handedness unresolved')
})
