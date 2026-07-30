import assert from 'node:assert/strict'
import test from 'node:test'
import { combineFrames } from './CompositionPcmRecorder.ts'
import { clampBoundaryCrossfade, createTransportSchedule, loopDurationSeconds, secondsPerBar, secondsPerBeat, validateBarCount, validateTempo } from './transportMath.ts'
import { canTransition, requireTransition } from './transportState.ts'
import { clampLayerVolume, deriveAudibleLayerIds, validateLayerForSession, validateLayerName } from './layerModel.ts'
import type { CompositionLayerMetadata, CompositionSession } from './compositionTypes.ts'

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
  assert.equal(canTransition('recordingLayer', 'playing'), false)
  assert.equal(requireTransition('countingIn', 'recordingLayer'), 'recordingLayer')
  assert.throws(() => requireTransition('recordingLayer', 'playing'))
})

test('clamps a short boundary crossfade safely', () => {
  assert.equal(clampBoundaryCrossfade(0.1, 1), 0.02)
  assert.equal(clampBoundaryCrossfade(0.02, 0.08), 0.01)
  assert.equal(clampBoundaryCrossfade(-1, 1), 0)
})

const layer = (id: string, options: Partial<CompositionLayerMetadata> = {}): CompositionLayerMetadata => ({ id, name: id, order: 0, bpm: 100, timeSignature: '4/4', barCount: 4, beatCount: 16, durationSeconds: 9.6, sampleRate: 48_000, frameCount: 460_800, channelCount: 2, muted: false, solo: false, volume: 1, createdAt: 1, modifiedAt: 1, sourceInstrumentId: 'warm-pad', sourceSoundType: 'built-in', boundaryCrossfadeDuration: 0.01, recordingDiscrepancyFrames: 0, recordingArchitectureVersion: 1, ...options })
const session = (layers: CompositionLayerMetadata[] = []): CompositionSession => ({ id: 'composition', name: 'Session', bpm: 100, timeSignature: '4/4', barCount: 4, durationSeconds: 9.6, sampleRate: 48_000, expectedFrameCount: 460_800, layers, activeLayerId: layers[0]?.id ?? null, createdAt: 1, modifiedAt: 1, sessionOnly: true, architectureVersion: 2 })

test('derives central mute and multi-solo audibility without changing layer buffers', () => {
  assert.deepEqual(deriveAudibleLayerIds([layer('one'), layer('two', { muted: true })]), ['one'])
  assert.deepEqual(deriveAudibleLayerIds([layer('one', { solo: true }), layer('two')]), ['one'])
  assert.deepEqual(deriveAudibleLayerIds([layer('one', { solo: true }), layer('two', { solo: true })]), ['one', 'two'])
  assert.deepEqual(deriveAudibleLayerIds([layer('one', { solo: true, muted: true }), layer('two')]), [])
  assert.equal(clampLayerVolume(2), 1.5)
  assert.equal(clampLayerVolume(-1), 0)
  assert.equal(validateLayerName('  Chords  '), 'Chords')
  assert.throws(() => validateLayerName('   '))
})

test('locks all layer timing to the first composition and rejects a fifth or mismatched layer', () => {
  const fourLayers = [layer('1'), layer('2'), layer('3'), layer('4')]
  assert.throws(() => validateLayerForSession(session(fourLayers), layer('5')))
  assert.throws(() => validateLayerForSession(session([layer('1')]), layer('2', { frameCount: 10 })))
  assert.throws(() => validateLayerForSession(session([layer('1')]), layer('1')))
})
