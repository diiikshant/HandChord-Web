import type { CanonicalGesture, StableHandRecognition } from './fingerState.ts'
import type { HandRecognition } from './fingerState.ts'
import { getGestureCount } from './gestureValidator.ts'

const CONFIRMATION_MS: Record<CanonicalGesture, number> = {
  fist: 300,
  one: 250,
  two: 250,
  three: 250,
  four: 250,
  'open-palm': 200,
}
const UNCLEAR_RETENTION_MS = 500

export class GestureStabiliser {
  private candidateGesture: CanonicalGesture | null = null
  private candidateSince: number | null = null
  private stableGesture: CanonicalGesture | null = null
  private stableSince: number | null = null
  private lastValidTimestamp: number | null = null

  update(recognition: HandRecognition, timestamp: number): StableHandRecognition {
    const candidate = recognition.canonicalGesture
    if (candidate) {
      this.lastValidTimestamp = timestamp
      if (this.candidateGesture !== candidate) {
        this.candidateGesture = candidate
        this.candidateSince = timestamp
      }

      const confirmationElapsed = timestamp - (this.candidateSince ?? timestamp)
      if (this.stableGesture !== candidate && confirmationElapsed >= CONFIRMATION_MS[candidate]) {
        this.stableGesture = candidate
        this.stableSince = timestamp
      }

      return {
        ...recognition,
        candidateGesture: this.candidateGesture,
        candidateSince: this.candidateSince,
        stableGesture: this.stableGesture,
        stableCount: getGestureCount(this.stableGesture),
        stableSince: this.stableSince,
        displayState: this.stableGesture === candidate ? 'stable' : 'hold',
        validationReason: this.stableGesture === candidate ? null : 'candidate still confirming',
      }
    }

    this.candidateGesture = null
    this.candidateSince = null
    const isUnclearFrame = recognition.reason !== 'unsupported finger pattern'
    const retainStable =
      isUnclearFrame &&
      this.stableGesture !== null &&
      this.lastValidTimestamp !== null &&
      timestamp - this.lastValidTimestamp <= UNCLEAR_RETENTION_MS
    if (!retainStable) {
      this.stableGesture = null
      this.stableSince = null
    }

    return {
      ...recognition,
      candidateGesture: null,
      candidateSince: null,
      stableGesture: this.stableGesture,
      stableCount: getGestureCount(this.stableGesture),
      stableSince: this.stableSince,
      displayState: retainStable ? 'stable' : 'unclear',
      validationReason: recognition.reason || 'hand temporarily missing',
    }
  }
}

export { CONFIRMATION_MS, UNCLEAR_RETENTION_MS }
