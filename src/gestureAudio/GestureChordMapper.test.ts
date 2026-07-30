import assert from 'node:assert/strict'
import test from 'node:test'
import { mapGestureChord } from './GestureChordMapper.ts'

test('maps primary-bank positions one through five in C major', () => {
  const names = ['one', 'two', 'three', 'four', 'open-palm'] as const
  const mappings = names.map((left) => mapGestureChord('C', 'major', left, 'open-palm'))

  assert.deepEqual(mappings.map((result) => result.kind === 'mapped' ? [result.mapping.chord.function, result.mapping.chord.name] : null), [
    ['I', 'C major'],
    ['ii', 'D minor'],
    ['iii', 'E minor'],
    ['IV', 'F major'],
    ['V', 'G major'],
  ])
})

test('maps secondary-bank positions one through five in C major', () => {
  const names = ['one', 'two', 'three', 'four', 'open-palm'] as const
  const mappings = names.map((left) => mapGestureChord('C', 'major', left, 'one'))

  assert.deepEqual(mappings.map((result) => result.kind === 'mapped' ? [result.mapping.chord.function, result.mapping.chord.name] : null), [
    ['vi', 'A minor'],
    ['vii°', 'B diminished'],
    ['♭VII', 'A♯ major'],
    ['iv', 'F minor'],
    ['V/vi', 'E major'],
  ])
})

test('uses the music engine for musically valid natural-minor mappings', () => {
  const primary = ['one', 'two', 'three', 'four', 'open-palm'].map((left) =>
    mapGestureChord('A', 'natural-minor', left as 'one' | 'two' | 'three' | 'four' | 'open-palm', 'open-palm'),
  )
  const secondary = ['one', 'two', 'three', 'four', 'open-palm'].map((left) =>
    mapGestureChord('A', 'natural-minor', left as 'one' | 'two' | 'three' | 'four' | 'open-palm', 'one'),
  )

  assert.deepEqual(primary.map((result) => result.kind === 'mapped' ? result.mapping.chord.name : null), [
    'A minor', 'B diminished', 'C major', 'D minor', 'E minor',
  ])
  assert.deepEqual(secondary.map((result) => result.kind === 'mapped' ? result.mapping.chord.name : null), [
    'F major', 'G major', 'G major', 'D minor', 'C major',
  ])
})

test('rejects unsupported right-hand bank gestures', () => {
  const result = mapGestureChord('C', 'major', 'one', 'two')

  assert.deepEqual(result, { kind: 'unsupported', reason: 'right-hand gesture does not select a chord bank' })
})
