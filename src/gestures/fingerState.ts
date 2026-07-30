import type { HandLandmark, TrackedHand } from '../tracking/handTrackingTypes'

export const FINGER_NAMES = ['thumb', 'index', 'middle', 'ring', 'little'] as const

export type FingerName = (typeof FINGER_NAMES)[number]
export type FingerState = 'extended' | 'folded' | 'unclear'
export type AnatomicalRole = 'left' | 'right' | 'unresolved'
export type CanonicalGesture = 'fist' | 'one' | 'two' | 'three' | 'four' | 'open-palm'

export type FingerStates = Record<FingerName, FingerState>

export type HandRecognition = {
  source: TrackedHand
  role: AnatomicalRole
  identityConfidence: number
  fingers: FingerStates
  fingerReasons: Partial<Record<FingerName, string>>
  rawExtendedCount: number | null
  canonicalGesture: CanonicalGesture | null
  reason: string | null
}

export type StableHandRecognition = HandRecognition & {
  candidateGesture: CanonicalGesture | null
  candidateSince: number | null
  stableGesture: CanonicalGesture | null
  stableCount: number | null
  stableSince: number | null
  displayState: 'stable' | 'hold' | 'unclear'
  validationReason: string | null
}

export type LandmarkSet = HandLandmark[]
