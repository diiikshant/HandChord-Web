import type { CanonicalGesture, FingerStates, HandRecognition } from './fingerState.ts'

const GESTURE_COUNTS: Record<CanonicalGesture, number> = {
  fist: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  'open-palm': 5,
}

const CANONICAL_PATTERNS: Record<CanonicalGesture, FingerStates> = {
  fist: { thumb: 'folded', index: 'folded', middle: 'folded', ring: 'folded', little: 'folded' },
  one: { thumb: 'folded', index: 'extended', middle: 'folded', ring: 'folded', little: 'folded' },
  two: { thumb: 'folded', index: 'extended', middle: 'extended', ring: 'folded', little: 'folded' },
  three: { thumb: 'folded', index: 'extended', middle: 'extended', ring: 'extended', little: 'folded' },
  four: { thumb: 'folded', index: 'extended', middle: 'extended', ring: 'extended', little: 'extended' },
  'open-palm': { thumb: 'extended', index: 'extended', middle: 'extended', ring: 'extended', little: 'extended' },
}

export function getGestureCount(gesture: CanonicalGesture | null) {
  return gesture ? GESTURE_COUNTS[gesture] : null
}

function isMatch(actual: FingerStates, expected: FingerStates) {
  return Object.entries(expected).every(([finger, state]) => actual[finger as keyof FingerStates] === state)
}

export function validateGesture(
  input: Pick<HandRecognition, 'source' | 'role' | 'fingers' | 'fingerReasons'>,
): HandRecognition {
  const hasUnclearFinger = Object.values(input.fingers).includes('unclear')
  const rawExtendedCount = hasUnclearFinger
    ? null
    : Object.values(input.fingers).filter((state) => state === 'extended').length

  if (input.role === 'unresolved') {
    return { ...input, identityConfidence: input.source.confidence, rawExtendedCount, canonicalGesture: null, reason: 'handedness unresolved' }
  }

  if (hasUnclearFinger) {
    const reason = Object.values(input.fingerReasons)[0] || 'low landmark confidence'
    return { ...input, identityConfidence: input.source.confidence, rawExtendedCount, canonicalGesture: null, reason }
  }

  const canonicalGesture = (Object.keys(CANONICAL_PATTERNS) as CanonicalGesture[]).find((gesture) =>
    isMatch(input.fingers, CANONICAL_PATTERNS[gesture]),
  )

  return {
    ...input,
    identityConfidence: input.source.confidence,
    rawExtendedCount,
    canonicalGesture: canonicalGesture || null,
    reason: canonicalGesture ? null : 'unsupported finger pattern',
  }
}
