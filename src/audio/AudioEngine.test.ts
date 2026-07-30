import assert from 'node:assert/strict'
import test from 'node:test'
import { AudioEngine, ChordPlaybackState } from './AudioEngine.ts'
import { mapRightVerticalToTapeDelay } from './TapeDelayMapping.ts'

test('does not create a duplicate logical trigger for the same chord', () => {
  const playback = new ChordPlaybackState()

  assert.equal(playback.trigger('C-major-I'), true)
  assert.equal(playback.trigger('C-major-I'), false)
  assert.equal(playback.active, 'C-major-I')
})

test('stop clears active logical notes', () => {
  const playback = new ChordPlaybackState()
  playback.trigger('C-major-V')

  playback.stop()

  assert.equal(playback.active, null)
})

test('keeps performance gain fixed at 100% while tape-delay parameters change', () => {
  const engine = new AudioEngine()
  const lower = mapRightVerticalToTapeDelay(0)
  const upper = mapRightVerticalToTapeDelay(1)

  assert.equal(engine.getFixedPerformanceGain(), 1)
  assert.equal(engine.getMasterVolume(), 1)
  engine.setTapeDelayParameters(lower)
  engine.setTapeDelayParameters(upper)

  assert.equal(engine.getFixedPerformanceGain(), 1)
  assert.deepEqual(engine.getTapeDelayParameters(), upper)
})

test('keeps the manual master volume as the independent safety control', () => {
  const engine = new AudioEngine()
  engine.setMasterVolume(0.45)
  assert.equal(engine.getMasterVolume(), 0.45)
  assert.equal(engine.getFixedPerformanceGain(), 1)
})

test('switches preset state without creating an audio context and keeps the default Warm Pad', () => {
  const engine = new AudioEngine()
  assert.equal(engine.getActiveInstrument().id, 'warm-pad')
  assert.equal(engine.hasTapeDelayGraph(), false)

  assert.equal(engine.setInstrument('pluck'), true)
  assert.equal(engine.getActiveInstrument().id, 'pluck')
  assert.equal(engine.setInstrument('pluck'), false)
  assert.equal(engine.hasTapeDelayGraph(), false)
})
