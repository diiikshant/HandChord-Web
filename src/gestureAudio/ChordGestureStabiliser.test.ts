import assert from 'node:assert/strict'
import test from 'node:test'
import type { AudioSnapshot } from '../audio/AudioEngine.ts'
import type { CanonicalGesture, StableHandRecognition } from '../gestures/fingerState.ts'
import { ChordGestureStabiliser } from './ChordGestureStabiliser.ts'
import { GestureAudioController, type GestureAudioPort } from './GestureAudioController.ts'

function hand(role: 'left' | 'right', stableGesture: CanonicalGesture): StableHandRecognition {
  return { role, stableGesture } as StableHandRecognition
}

function pair(left: CanonicalGesture, right: CanonicalGesture) {
  return [hand('left', left), hand('right', right)]
}

class FakeAudio implements GestureAudioPort {
  readonly plays: string[] = []
  stops = 0
  activeChordId: string | null = null

  getSnapshot(): AudioSnapshot {
    return { status: 'ready', contextState: 'running', activeChordId: this.activeChordId, error: null }
  }

  playChord(chordId: string) {
    this.plays.push(chordId)
    this.activeChordId = chordId
    return true
  }

  stop() {
    this.stops += 1
    this.activeChordId = null
  }
}

test('requires a complete two-hand combination for 100 ms before playing', () => {
  const stabiliser = new ChordGestureStabiliser()

  assert.equal(stabiliser.update(pair('one', 'open-palm'), 'C', 'major', 0).state, 'hold')
  assert.equal(stabiliser.update(pair('one', 'open-palm'), 'C', 'major', 99).state, 'hold')
  const confirmed = stabiliser.update(pair('one', 'open-palm'), 'C', 'major', 100)
  assert.equal(confirmed.state, 'playing')
  assert.equal(confirmed.mapping?.chord.name, 'C major')
})

test('does not stop for one fist but stops both stable fists after 500 ms', () => {
  const stabiliser = new ChordGestureStabiliser()

  assert.equal(stabiliser.update(pair('fist', 'open-palm'), 'C', 'major', 0).shouldStop, false)
  assert.equal(stabiliser.update(pair('fist', 'fist'), 'C', 'major', 100).shouldStop, false)
  assert.equal(stabiliser.update(pair('fist', 'fist'), 'C', 'major', 599).shouldStop, false)
  const stop = stabiliser.update(pair('fist', 'fist'), 'C', 'major', 600)
  assert.equal(stop.shouldStop, true)
  assert.equal(stop.state, 'stopped')
})

test('retains an individual role for 650 ms and keeps a chord through 900 ms of unclear tracking', () => {
  const stabiliser = new ChordGestureStabiliser()
  stabiliser.update(pair('one', 'open-palm'), 'C', 'major', 0)
  stabiliser.update(pair('one', 'open-palm'), 'C', 'major', 100)

  const retained = stabiliser.update([hand('left', 'one')], 'C', 'major', 700)
  assert.equal(retained.state, 'tracking-lost')
  assert.equal(retained.mapping?.chord.name, 'C major')

  const unclearGrace = stabiliser.update([hand('left', 'one')], 'C', 'major', 1000)
  assert.equal(unclearGrace.state, 'tracking-lost')
  const expired = stabiliser.update([hand('left', 'one')], 'C', 'major', 1601)
  assert.equal(expired.state, 'waiting')
})

test('releases only after both hands have been missing for 850 ms', () => {
  const stabiliser = new ChordGestureStabiliser()
  stabiliser.update(pair('one', 'open-palm'), 'C', 'major', 0)
  stabiliser.update(pair('one', 'open-palm'), 'C', 'major', 100)

  assert.equal(stabiliser.update([], 'C', 'major', 400).shouldStop, false)
  assert.equal(stabiliser.update([], 'C', 'major', 1249).shouldStop, false)
  assert.equal(stabiliser.update([], 'C', 'major', 1250).shouldStop, true)
})

test('treats retained missing-hand diagnostics as missing rather than fresh hand input', () => {
  const stabiliser = new ChordGestureStabiliser()
  stabiliser.update(pair('one', 'open-palm'), 'C', 'major', 0)
  stabiliser.update(pair('one', 'open-palm'), 'C', 'major', 100)
  const missingLeft = hand('left', 'one')
  const missingRight = hand('right', 'open-palm')
  missingLeft.reason = 'hand temporarily missing'
  missingRight.reason = 'hand temporarily missing'

  assert.equal(stabiliser.update([missingLeft, missingRight], 'C', 'major', 400, 0).shouldStop, false)
  assert.equal(stabiliser.update([missingLeft, missingRight], 'C', 'major', 1250, 0).shouldStop, true)
})

test('allows hands to arrive on different updates and preserves roles when array order changes', () => {
  const stabiliser = new ChordGestureStabiliser()

  assert.equal(stabiliser.update([hand('left', 'two')], 'C', 'major', 0).state, 'waiting')
  assert.equal(stabiliser.update([hand('left', 'two'), hand('right', 'open-palm')], 'C', 'major', 100).state, 'hold')
  assert.equal(stabiliser.update([hand('right', 'open-palm'), hand('left', 'two')], 'C', 'major', 200).mapping?.chord.name, 'D minor')
})

test('serialises gesture audio, avoids repeated triggers, and leaves button audio usable after toggling off', () => {
  const audio = new FakeAudio()
  const controller = new GestureAudioController(audio)
  controller.setEnabled(true)
  controller.process(pair('one', 'open-palm'), 'C', 'major', 0)
  controller.process(pair('one', 'open-palm'), 'C', 'major', 100)
  controller.process(pair('one', 'open-palm'), 'C', 'major', 700)
  assert.equal(audio.plays.length, 1)

  controller.setEnabled(false)
  assert.equal(audio.stops, 1)

  audio.playChord('button-C-major-I', [60, 64, 67])
  controller.setEnabled(false)
  assert.equal(audio.activeChordId, 'button-C-major-I')
})
