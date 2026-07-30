import assert from 'node:assert/strict'
import test from 'node:test'
import {
  generateDiatonicTriad,
  generateScale,
  midiToFrequency,
  midiToNoteName,
} from './MusicTheoryEngine.ts'

test('generates major and natural-minor scales algorithmically', () => {
  assert.deepEqual(generateScale('C', 'major'), ['C', 'D', 'E', 'F', 'G', 'A', 'B'])
  assert.deepEqual(generateScale('A', 'natural-minor'), ['A', 'B', 'C', 'D', 'E', 'F', 'G'])
  assert.deepEqual(generateScale('D', 'major'), ['D', 'E', 'F♯', 'G', 'A', 'B', 'C♯'])
})

test('builds all requested C-major diatonic triads', () => {
  const chords = [1, 2, 3, 4, 5, 6].map((degree) => generateDiatonicTriad('C', 'major', degree))

  assert.deepEqual(chords.map((chord) => [chord.function, chord.name, chord.noteNames]), [
    ['I', 'C major', ['C4', 'E4', 'G4']],
    ['ii', 'D minor', ['D4', 'F4', 'A4']],
    ['iii', 'E minor', ['E4', 'G4', 'B4']],
    ['IV', 'F major', ['F4', 'A4', 'C5']],
    ['V', 'G major', ['G4', 'B4', 'D5']],
    ['vi', 'A minor', ['A4', 'C5', 'E5']],
  ])
})

test('builds major, minor, and diminished A-natural-minor triads', () => {
  const chords = [1, 2, 3, 4, 5, 6].map((degree) => generateDiatonicTriad('A', 'natural-minor', degree))

  assert.deepEqual(chords.map((chord) => [chord.function, chord.name, chord.quality]), [
    ['i', 'A minor', 'minor'],
    ['ii°', 'B diminished', 'diminished'],
    ['III', 'C major', 'major'],
    ['iv', 'D minor', 'minor'],
    ['v', 'E minor', 'minor'],
    ['VI', 'F major', 'major'],
  ])
})

test('transposes chords and converts MIDI values', () => {
  const eMajorFive = generateDiatonicTriad('E', 'major', 5)

  assert.equal(eMajorFive.name, 'B major')
  assert.deepEqual(eMajorFive.midiNotes, [71, 75, 78])
  assert.equal(midiToFrequency(69), 440)
  assert.equal(Math.round(midiToFrequency(60) * 100) / 100, 261.63)
  assert.equal(midiToNoteName(60), 'C')
  assert.equal(midiToNoteName(70), 'A♯')
})

test('rejects an invalid scale degree', () => {
  assert.throws(() => generateDiatonicTriad('C', 'major', 0), /1 to 7/)
})
