import assert from 'node:assert/strict'
import test from 'node:test'
import { combineFrames } from './CompositionPcmRecorder.ts'
import { clampBoundaryCrossfade, createTransportSchedule, loopDurationSeconds, secondsPerBar, secondsPerBeat, validateBarCount, validateTempo } from './transportMath.ts'
import { canTransition, requireTransition } from './transportState.ts'

test('calculates 4/4 musical timing for every supported loop length', () => {
  assert.equal(secondsPerBeat(120), 0.5)
  assert.equal(secondsPerBar(120), 2)
  assert.equal(loopDurationSeconds(120, 1), 2)
  assert.equal(loopDurationSeconds(120, 2), 4)
  assert.equal(loopDurationSeconds(120, 4), 8)
  assert.equal(loopDurationSeconds(120, 8), 16)
})

test('builds exact frame boundaries from AudioContext-time transport scheduling', () => {
  const schedule = createTransportSchedule({ bpm: 120, barCount: 4, countInBars: 1 }, 48_000, 10)
  assert.equal(schedule.secondsPerBeat, 0.5)
  assert.equal(schedule.secondsPerBar, 2)
  assert.equal(schedule.loopDurationSeconds, 8)
  assert.equal(schedule.expectedFrameCount, 384_000)
  assert.equal(schedule.endFrame - schedule.startFrame, 384_000)
  assert.equal(schedule.recordingStartTime, 12.06)
})

test('rejects unsupported tempo and bar values', () => {
  assert.equal(validateTempo(40), true)
  assert.equal(validateTempo(220), true)
  assert.equal(validateTempo(39), false)
  assert.equal(validateTempo(221), false)
  assert.equal(validateBarCount(4), true)
  assert.equal(validateBarCount(3), false)
  assert.throws(() => createTransportSchedule({ bpm: 39, barCount: 4, countInBars: 1 }, 48_000, 0))
})

test('trims extra PCM frames and pads missing frames without changing the expected loop size', () => {
  assert.deepEqual([...combineFrames([Float32Array.from([1, 2]), Float32Array.from([3, 4])], 3)], [1, 2, 3])
  assert.deepEqual([...combineFrames([Float32Array.from([1, 2])], 4)], [1, 2, 0, 0])
})

test('uses an explicit transport state model and rejects invalid transitions', () => {
  assert.equal(canTransition('idle', 'armed'), true)
  assert.equal(canTransition('recording', 'playing'), false)
  assert.equal(requireTransition('countingIn', 'recording'), 'recording')
  assert.throws(() => requireTransition('recording', 'playing'))
})

test('clamps a short boundary crossfade safely', () => {
  assert.equal(clampBoundaryCrossfade(0.1, 1), 0.02)
  assert.equal(clampBoundaryCrossfade(0.02, 0.08), 0.01)
  assert.equal(clampBoundaryCrossfade(-1, 1), 0)
})
