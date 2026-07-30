import type { StableHandRecognition, CanonicalGesture } from '../gestures/fingerState.ts'
import type { RootKey, ScaleName } from '../music/MusicTheoryEngine.ts'
import { mapGestureChord, type ChordBank, type GestureChordMapping } from './GestureChordMapper.ts'

export type GestureAudioState =
  | 'waiting'
  | 'hold'
  | 'playing'
  | 'unsupported'
  | 'tracking-lost'
  | 'stopped'

export type ChordGestureDecision = {
  state: GestureAudioState
  leftGesture: CanonicalGesture | null
  rightGesture: CanonicalGesture | null
  bank: ChordBank | null
  mapping: GestureChordMapping | null
  shouldStop: boolean
  reason: string | null
}

const ROLE_RETENTION_MS = 650
// Finger recognition already confirms each gesture for 200–300 ms. This short
// second confirmation avoids a sluggish double wait while still rejecting a
// single tracking-frame change.
const COMBINATION_CONFIRMATION_MS = 100
const FIST_STOP_CONFIRMATION_MS = 500
const UNCLEAR_GRACE_MS = 900
const BOTH_MISSING_RELEASE_MS = 850

type RememberedRole = { gesture: CanonicalGesture; timestamp: number }

function noDecision(
  state: GestureAudioState,
  leftGesture: CanonicalGesture | null,
  rightGesture: CanonicalGesture | null,
  reason: string | null = null,
  shouldStop = false,
): ChordGestureDecision {
  return { state, leftGesture, rightGesture, bank: null, mapping: null, reason, shouldStop }
}

/** Converts stable gesture snapshots into time-confirmed chord decisions. */
export class ChordGestureStabiliser {
  private readonly remembered = new Map<'left' | 'right', RememberedRole>()
  private candidateId: string | null = null
  private candidateSince: number | null = null
  private confirmedId: string | null = null
  private lastValidCombinationAt: number | null = null
  private bothFistsSince: number | null = null
  private bothFistStopIssued = false
  private bothHandsMissingSince: number | null = null
  private missingStopIssued = false

  update(
    recognitions: StableHandRecognition[],
    root: RootKey,
    scale: ScaleName,
    timestamp: number,
    liveHandCount?: number,
  ): ChordGestureDecision {
    const direct = this.readDirectRoles(recognitions, timestamp)
    const left = this.getRememberedGesture('left', timestamp)
    const right = this.getRememberedGesture('right', timestamp)
    const usesRetainedRole = !direct.left || !direct.right

    // The recognition hook intentionally keeps diagnostic records for a
    // missing hand. Use MediaPipe's live hand count when available so those
    // retained records cannot delay the safety release timer.
    const hasLiveHand = liveHandCount !== undefined
      ? liveHandCount > 0
      : recognitions.some((recognition) => recognition.reason !== 'hand temporarily missing')
    if (!hasLiveHand) {
      this.bothHandsMissingSince ??= timestamp
    } else {
      this.bothHandsMissingSince = null
      this.missingStopIssued = false
    }

    if (direct.left?.stableGesture === 'fist' && direct.right?.stableGesture === 'fist') {
      this.bothFistsSince ??= timestamp
      if (timestamp - this.bothFistsSince >= FIST_STOP_CONFIRMATION_MS) {
        if (!this.bothFistStopIssued) {
          this.bothFistStopIssued = true
          this.clearConfirmation()
          return noDecision('stopped', left, right, 'both fists confirmed', true)
        }
        return noDecision('stopped', left, right, 'both fists confirmed')
      }
      return noDecision('hold', left, right, 'hold both fists to stop')
    }
    this.bothFistsSince = null
    this.bothFistStopIssued = false

    if (this.bothHandsMissingSince !== null && timestamp - this.bothHandsMissingSince >= BOTH_MISSING_RELEASE_MS) {
      if (!this.missingStopIssued) {
        this.missingStopIssued = true
        this.clearConfirmation()
        return noDecision('stopped', left, right, 'both hands missing', true)
      }
      return noDecision('stopped', left, right, 'both hands missing')
    }

    const result = mapGestureChord(root, scale, left, right)
    if (result.kind === 'mapped') {
      this.lastValidCombinationAt = timestamp
      const { mapping } = result
      if (this.confirmedId === mapping.id) {
        return {
          state: usesRetainedRole ? 'tracking-lost' : 'playing',
          leftGesture: left,
          rightGesture: right,
          bank: mapping.bank,
          mapping,
          shouldStop: false,
          reason: usesRetainedRole ? 'retaining the most recent hand gesture' : null,
        }
      }

      if (this.candidateId !== mapping.id) {
        this.candidateId = mapping.id
        this.candidateSince = timestamp
      }
      if (this.candidateSince !== null && timestamp - this.candidateSince >= COMBINATION_CONFIRMATION_MS) {
        this.confirmedId = mapping.id
        this.candidateId = null
        this.candidateSince = null
        return {
          state: 'playing',
          leftGesture: left,
          rightGesture: right,
          bank: mapping.bank,
          mapping,
          shouldStop: false,
          reason: null,
        }
      }

      return {
        state: 'hold',
        leftGesture: left,
        rightGesture: right,
        bank: mapping.bank,
        mapping,
        shouldStop: false,
        reason: 'candidate still confirming',
      }
    }

    this.candidateId = null
    this.candidateSince = null
    if (result.kind === 'unsupported') {
      return noDecision('unsupported', left, right, result.reason)
    }

    if (this.lastValidCombinationAt !== null && timestamp - this.lastValidCombinationAt <= UNCLEAR_GRACE_MS) {
      return noDecision('tracking-lost', left, right, 'tracking temporarily lost')
    }

    return noDecision('waiting', left, right)
  }

  resetConfirmation() {
    this.clearConfirmation()
  }

  private readDirectRoles(recognitions: StableHandRecognition[], timestamp: number) {
    const direct: Partial<Record<'left' | 'right', StableHandRecognition>> = {}
    recognitions.forEach((recognition) => {
      if (
        recognition.reason !== 'hand temporarily missing' &&
        (recognition.role === 'left' || recognition.role === 'right') &&
        recognition.stableGesture
      ) {
        direct[recognition.role] = recognition
        this.remembered.set(recognition.role, { gesture: recognition.stableGesture, timestamp })
      }
    })
    return direct
  }

  private getRememberedGesture(role: 'left' | 'right', timestamp: number) {
    const remembered = this.remembered.get(role)
    if (!remembered || timestamp - remembered.timestamp > ROLE_RETENTION_MS) {
      return null
    }
    return remembered.gesture
  }

  private clearConfirmation() {
    this.candidateId = null
    this.candidateSince = null
    this.confirmedId = null
    this.lastValidCombinationAt = null
  }
}

export const GESTURE_AUDIO_TIMING = {
  roleRetentionMs: ROLE_RETENTION_MS,
  combinationConfirmationMs: COMBINATION_CONFIRMATION_MS,
  fistStopConfirmationMs: FIST_STOP_CONFIRMATION_MS,
  unclearGraceMs: UNCLEAR_GRACE_MS,
  bothHandsMissingReleaseMs: BOTH_MISSING_RELEASE_MS,
} as const
