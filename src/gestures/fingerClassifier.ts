import type { TrackedHand } from '../tracking/handTrackingTypes.ts'
import type {
  AnatomicalRole,
  FingerName,
  FingerStates,
  HandRecognition,
  LandmarkSet,
} from './fingerState.ts'
import { validateGesture } from './gestureValidator.ts'

type Vector = { x: number; y: number; z: number }

const MIN_LANDMARK_VISIBILITY = 0.5
const MIN_HANDEDNESS_CONFIDENCE = 0.7

const LONG_FINGERS: Record<Exclude<FingerName, 'thumb'>, [number, number, number, number]> = {
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  little: [17, 18, 19, 20],
}

function subtract(a: Vector, b: Vector): Vector {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

function magnitude(vector: Vector) {
  return Math.hypot(vector.x, vector.y, vector.z)
}

function normalise(vector: Vector): Vector {
  const length = magnitude(vector)
  return length === 0 ? { x: 0, y: 0, z: 0 } : { x: vector.x / length, y: vector.y / length, z: vector.z / length }
}

function dot(a: Vector, b: Vector) {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function distance(a: Vector, b: Vector) {
  return magnitude(subtract(a, b))
}

function angleDegrees(a: Vector, b: Vector) {
  const denominator = magnitude(a) * magnitude(b)
  if (denominator === 0) {
    return 180
  }

  const cosine = Math.max(-1, Math.min(1, dot(a, b) / denominator))
  return (Math.acos(cosine) * 180) / Math.PI
}

function isVisible(landmark: Vector & { visibility?: number } | undefined) {
  return Boolean(
    landmark &&
      (landmark.visibility === undefined ||
        landmark.visibility === 0 ||
        landmark.visibility >= MIN_LANDMARK_VISIBILITY),
  )
}

function average(points: Vector[]): Vector {
  const total = points.reduce(
    (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y, z: sum.z + point.z }),
    { x: 0, y: 0, z: 0 },
  )
  return { x: total.x / points.length, y: total.y / points.length, z: total.z / points.length }
}

function getRole(handedness: string, confidence: number): AnatomicalRole {
  if (confidence < MIN_HANDEDNESS_CONFIDENCE) {
    return 'unresolved'
  }

  const normalised = handedness.toLowerCase()
  return normalised === 'left' || normalised === 'right' ? normalised : 'unresolved'
}

function classifyLongFinger(
  landmarks: LandmarkSet,
  indices: [number, number, number, number],
  palmCenter: Vector,
  palmAxis: Vector,
  palmSize: number,
): { state: FingerStates[Exclude<FingerName, 'thumb'>]; reason?: string } {
  const [mcp, pip, dip, tip] = indices.map((index) => landmarks[index])
  if (!isVisible(mcp) || !isVisible(pip) || !isVisible(dip)) {
    return { state: 'unclear', reason: 'required joint missing' }
  }

  const firstSegment = subtract(pip, mcp)
  const secondSegment = subtract(dip, pip)
  const firstJointAngle = angleDegrees(firstSegment, secondSegment)
  const stronglyFoldedByJoints = firstJointAngle > 65

  // A fist can hide a fingertip; the visible MCP/PIP/DIP bend still proves folding.
  if (!isVisible(tip)) {
    return stronglyFoldedByJoints
      ? { state: 'folded' }
      : { state: 'unclear', reason: 'low landmark confidence' }
  }

  const thirdSegment = subtract(tip, dip)
  const secondJointAngle = angleDegrees(secondSegment, thirdSegment)
  const tipDistance = distance(tip, palmCenter)
  const mcpDistance = distance(mcp, palmCenter)
  const alongPalmAxis = dot(normalise(subtract(tip, mcp)), palmAxis)

  const extended =
    firstJointAngle < 35 &&
    secondJointAngle < 35 &&
    tipDistance > Math.max(mcpDistance * 1.8, mcpDistance + palmSize * 0.35) &&
    alongPalmAxis > 0.55
  if (extended) {
    return { state: 'extended' }
  }

  const folded =
    stronglyFoldedByJoints ||
    secondJointAngle > 65 ||
    tipDistance < mcpDistance + palmSize * 0.65 ||
    alongPalmAxis < 0.3
  if (folded) {
    return { state: 'folded' }
  }

  return { state: 'unclear', reason: 'finger geometry is between folded and extended' }
}

function classifyThumb(
  landmarks: LandmarkSet,
  role: AnatomicalRole,
  palmCenter: Vector,
  palmSize: number,
): { state: FingerStates['thumb']; reason?: string } {
  const [cmc, mcp, ip, tip] = [landmarks[1], landmarks[2], landmarks[3], landmarks[4]]
  const indexMcp = landmarks[5]
  const littleMcp = landmarks[17]
  if (!isVisible(cmc) || !isVisible(mcp) || !isVisible(ip) || !isVisible(indexMcp) || !isVisible(littleMcp)) {
    return { state: 'unclear', reason: 'required joint missing' }
  }
  if (role === 'unresolved') {
    return { state: 'unclear', reason: 'handedness unresolved' }
  }

  const firstSegment = subtract(mcp, cmc)
  const secondSegment = subtract(ip, mcp)
  const firstJointAngle = angleDegrees(firstSegment, secondSegment)
  if (!isVisible(tip)) {
    return firstJointAngle > 70
      ? { state: 'folded' }
      : { state: 'unclear', reason: 'low landmark confidence' }
  }

  const thirdSegment = subtract(tip, ip)
  const secondJointAngle = angleDegrees(secondSegment, thirdSegment)
  // The index-to-little axis gives an anatomical, hand-local outward direction for either hand.
  const radialAxis = normalise(subtract(indexMcp, littleMcp))
  const palmWidth = distance(indexMcp, littleMcp)
  const outwardSeparation = dot(subtract(tip, palmCenter), radialAxis)
  const tipFromPalm = distance(tip, palmCenter)
  const mcpFromPalm = distance(mcp, palmCenter)
  const tipFromIndexMcp = distance(tip, indexMcp)

  // A closed fist can place the thumb across the curled fingers rather than
  // sharply bending it at both joints. In that case it is still a folded thumb
  // when the tip stays inside the compact hand area and is not pointing outward.
  // This check comes first so a compact thumb is not mistaken for an open one
  // merely because its short visible segments happen to align in 2D.
  const compactTuckedThumb =
    tipFromPalm < palmSize * 1.4 &&
    tipFromIndexMcp < palmSize * 1.35 &&
    (firstJointAngle > 45 || secondJointAngle > 45 || outwardSeparation < palmWidth * 0.55)
  if (compactTuckedThumb) {
    return { state: 'folded' }
  }

  // A naturally open thumb often has a small bend and points diagonally.  Use
  // several hand-local signals together, rather than letting one 2D measure
  // incorrectly turn an open thumb into a folded thumb.
  const extensionSignals = [
    firstJointAngle < 85,
    secondJointAngle < 85,
    outwardSeparation > palmWidth * 0.12,
    tipFromPalm > mcpFromPalm + palmSize * 0.25,
    tipFromIndexMcp > palmSize * 0.4,
  ]
  const extended = extensionSignals.filter(Boolean).length >= 4
  if (extended) {
    return { state: 'extended' }
  }

  // Conversely, do not call a thumb folded because of one noisy landmark.
  // The four-finger pose needs multiple strong signs that the thumb is tucked.
  const foldedSignals = [
    firstJointAngle > 105,
    secondJointAngle > 105,
    outwardSeparation < -palmWidth * 0.05,
    tipFromPalm < mcpFromPalm + palmSize * 0.15,
    tipFromIndexMcp < palmSize * 0.3,
  ]
  const folded = foldedSignals.filter(Boolean).length >= 2
  if (folded) {
    return { state: 'folded' }
  }

  return { state: 'unclear', reason: 'thumb geometry is between folded and extended' }
}

export function recogniseHand(hand: TrackedHand): HandRecognition {
  const role = getRole(hand.handedness, hand.confidence)
  const landmarks = hand.landmarks
  const emptyStates: FingerStates = {
    thumb: 'unclear',
    index: 'unclear',
    middle: 'unclear',
    ring: 'unclear',
    little: 'unclear',
  }

  if (landmarks.length < 21) {
    return {
      source: hand,
      role,
      identityConfidence: hand.confidence,
      fingers: emptyStates,
      fingerReasons: { thumb: 'required joint missing' },
      rawExtendedCount: null,
      canonicalGesture: null,
      reason: 'required joint missing',
    }
  }

  const wrist = landmarks[0]
  const indexMcp = landmarks[5]
  const middleMcp = landmarks[9]
  const ringMcp = landmarks[13]
  const littleMcp = landmarks[17]
  if (![wrist, indexMcp, middleMcp, ringMcp, littleMcp].every(isVisible)) {
    return {
      source: hand,
      role,
      identityConfidence: hand.confidence,
      fingers: emptyStates,
      fingerReasons: { index: 'low landmark confidence' },
      rawExtendedCount: null,
      canonicalGesture: null,
      reason: 'low landmark confidence',
    }
  }

  const palmCenter = average([wrist, indexMcp, middleMcp, ringMcp, littleMcp])
  const palmAxis = normalise(subtract(middleMcp, wrist))
  const palmSize = Math.max(distance(wrist, middleMcp), 0.001)
  const fingerReasons: HandRecognition['fingerReasons'] = {}
  const thumb = classifyThumb(landmarks, role, palmCenter, palmSize)
  const fingers: FingerStates = { thumb: thumb.state, index: 'unclear', middle: 'unclear', ring: 'unclear', little: 'unclear' }
  if (thumb.reason) {
    fingerReasons.thumb = thumb.reason
  }

  ;(['index', 'middle', 'ring', 'little'] as const).forEach((finger) => {
    const result = classifyLongFinger(landmarks, LONG_FINGERS[finger], palmCenter, palmAxis, palmSize)
    fingers[finger] = result.state
    if (result.reason) {
      fingerReasons[finger] = result.reason
    }
  })

  return validateGesture({ source: hand, role, fingers, fingerReasons })
}
