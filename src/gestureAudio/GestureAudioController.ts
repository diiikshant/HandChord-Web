import type { AudioSnapshot } from '../audio/AudioEngine.ts'
import type { StableHandRecognition } from '../gestures/fingerState.ts'
import type { GeneratedChord, RootKey, ScaleName } from '../music/MusicTheoryEngine.ts'
import { ChordGestureStabiliser, type GestureAudioState } from './ChordGestureStabiliser.ts'
import type { ChordBank } from './GestureChordMapper.ts'

export type GestureAudioPort = {
  getSnapshot(): AudioSnapshot
  playChord(chordId: string, midiNotes: number[]): boolean
  stop(): void
}

export type GestureAudioSnapshot = {
  enabled: boolean
  state: GestureAudioState
  leftGesture: string | null
  rightGesture: string | null
  bank: ChordBank | null
  chord: GeneratedChord | null
  reason: string | null
}

const INITIAL_SNAPSHOT: GestureAudioSnapshot = {
  enabled: false,
  state: 'waiting',
  leftGesture: null,
  rightGesture: null,
  bank: null,
  chord: null,
  reason: 'Gesture Audio is off',
}

/** The only code path that turns confirmed hand combinations into audio changes. */
export class GestureAudioController {
  private readonly stabiliser = new ChordGestureStabiliser()
  private enabled = false
  private activeGestureChordId: string | null = null
  private snapshot: GestureAudioSnapshot = INITIAL_SNAPSHOT
  private readonly audio: GestureAudioPort
  private readonly onEmergencyStop: (() => void) | undefined

  constructor(audio: GestureAudioPort, onEmergencyStop?: () => void) {
    this.audio = audio
    this.onEmergencyStop = onEmergencyStop
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled
    if (!enabled) {
      this.stopOwnedChord()
      this.stabiliser.resetConfirmation()
      this.snapshot = { ...INITIAL_SNAPSHOT }
    }
    return this.snapshot
  }

  process(
    recognitions: StableHandRecognition[],
    root: RootKey,
    scale: ScaleName,
    timestamp: number,
    liveHandCount?: number,
  ) {
    if (!this.enabled) {
      return this.snapshot
    }

    const decision = this.stabiliser.update(recognitions, root, scale, timestamp, liveHandCount)
    if (decision.shouldStop) {
      this.stopOwnedChord()
      this.snapshot = {
        enabled: true,
        state: 'stopped',
        leftGesture: decision.leftGesture,
        rightGesture: decision.rightGesture,
        bank: null,
        chord: null,
        reason: decision.reason,
      }
      return this.snapshot
    }

    let chord = this.snapshot.chord
    if (decision.mapping && decision.state === 'playing') {
      const audioSnapshot = this.audio.getSnapshot()
      if (audioSnapshot.status === 'ready' && this.activeGestureChordId !== decision.mapping.id) {
        try {
          this.audio.playChord(`gesture-${decision.mapping.id}`, decision.mapping.chord.midiNotes)
          this.activeGestureChordId = decision.mapping.id
          chord = decision.mapping.chord
        } catch (error) {
          this.snapshot = {
            enabled: true,
            state: 'waiting',
            leftGesture: decision.leftGesture,
            rightGesture: decision.rightGesture,
            bank: decision.mapping.bank,
            chord: null,
            reason: error instanceof Error ? error.message : 'Audio could not play this chord',
          }
          return this.snapshot
        }
      }
      if (this.activeGestureChordId === decision.mapping.id) {
        chord = decision.mapping.chord
      }
    }

    this.snapshot = {
      enabled: true,
      state: decision.state,
      leftGesture: decision.leftGesture,
      rightGesture: decision.rightGesture,
      bank: decision.bank,
      chord,
      reason: decision.reason,
    }
    return this.snapshot
  }

  releaseOwnership() {
    this.activeGestureChordId = null
    this.stabiliser.resetConfirmation()
    this.snapshot = { ...this.snapshot, chord: null, state: 'waiting', reason: 'Audio Test controls are active' }
    return this.snapshot
  }

  private stopOwnedChord() {
    const activeAudioId = this.audio.getSnapshot().activeChordId
    if (this.activeGestureChordId && activeAudioId === `gesture-${this.activeGestureChordId}`) {
      this.audio.stop()
      this.onEmergencyStop?.()
    }
    this.activeGestureChordId = null
  }
}
