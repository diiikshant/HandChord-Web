import type { AnatomicalRole } from '../gestures/fingerState.ts'
import type { TrackedHand } from '../tracking/handTrackingTypes.ts'

export type PalmPosition = {
  role: Exclude<AnatomicalRole, 'unresolved'>
  confidence: number
  rawX: number
  rawY: number
}

const PALM_INDICES = [0, 5, 9, 13, 17]
const MIN_HANDEDNESS_CONFIDENCE = 0.7

function visible(visibility: number | undefined) {
  return visibility === undefined || visibility === 0 || visibility >= 0.5
}

/** Produces camera-visible palm coordinates without changing the overlay pipeline. */
export function getPalmPosition(hand: TrackedHand): PalmPosition | { reason: string } {
  const role = hand.handedness.toLowerCase()
  if ((role !== 'left' && role !== 'right') || hand.confidence < MIN_HANDEDNESS_CONFIDENCE) {
    return { reason: 'handedness unresolved' }
  }
  const points = PALM_INDICES.map((index) => hand.landmarks[index])
  if (points.some((point) => !point || !visible(point.visibility))) {
    return { reason: 'low landmark confidence' }
  }
  const sourceX = points.reduce((sum, point) => sum + point.x, 0) / points.length
  const sourceY = points.reduce((sum, point) => sum + point.y, 0) / points.length

  // MediaPipe coordinates are camera coordinates. Convert once to the mirrored,
  // upward-positive coordinates the user sees: left/down are 0; right/up are 1.
  return { role, confidence: hand.confidence, rawX: 1 - sourceX, rawY: 1 - sourceY }
}
