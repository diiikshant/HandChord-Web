import assert from 'node:assert/strict'
import test from 'node:test'
import { ChordPlaybackState } from './AudioEngine.ts'

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
