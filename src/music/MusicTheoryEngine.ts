export const CHROMATIC_NOTES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const

export type RootKey = (typeof CHROMATIC_NOTES)[number]
export type ScaleName = 'major' | 'natural-minor'
export type ChordQuality = 'major' | 'minor' | 'diminished'

export type DiatonicChord = {
  degree: number
  function: string
  root: RootKey
  quality: ChordQuality
  name: string
  midiNotes: number[]
  noteNames: string[]
}

const SCALE_INTERVALS: Record<ScaleName, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  'natural-minor': [0, 2, 3, 5, 7, 8, 10],
}

const MAJOR_ROMAN_NUMERALS = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']
const NATURAL_MINOR_ROMAN_NUMERALS = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII']
const ROOT_MIDI_C4 = 60

function getNoteIndex(note: RootKey) {
  return CHROMATIC_NOTES.indexOf(note)
}

function noteAtChromaticIndex(index: number): RootKey {
  return CHROMATIC_NOTES[((index % 12) + 12) % 12]
}

function noteNameWithOctave(midi: number) {
  return `${midiToNoteName(midi)}${Math.floor(midi / 12) - 1}`
}

function qualityFromIntervals(root: number, third: number, fifth: number): ChordQuality {
  const thirdDistance = (third - root + 12) % 12
  const fifthDistance = (fifth - root + 12) % 12

  if (thirdDistance === 4 && fifthDistance === 7) {
    return 'major'
  }
  if (thirdDistance === 3 && fifthDistance === 7) {
    return 'minor'
  }
  if (thirdDistance === 3 && fifthDistance === 6) {
    return 'diminished'
  }

  throw new Error('The selected scale degree does not form a supported triad.')
}

export function getScaleIntervals(scale: ScaleName) {
  return [...SCALE_INTERVALS[scale]]
}

export function generateScale(root: RootKey, scale: ScaleName) {
  const rootIndex = getNoteIndex(root)
  return SCALE_INTERVALS[scale].map((interval) => noteAtChromaticIndex(rootIndex + interval))
}

export function midiToFrequency(midi: number) {
  if (!Number.isFinite(midi)) {
    throw new Error('MIDI note must be a finite number.')
  }

  return 440 * 2 ** ((midi - 69) / 12)
}

export function midiToNoteName(midi: number): RootKey {
  if (!Number.isInteger(midi)) {
    throw new Error('MIDI note must be a whole number.')
  }

  return noteAtChromaticIndex(midi)
}

export function generateDiatonicTriad(root: RootKey, scale: ScaleName, degree: number): DiatonicChord {
  if (!Number.isInteger(degree) || degree < 1 || degree > 7) {
    throw new Error('Scale degree must be a whole number from 1 to 7.')
  }

  const intervals = SCALE_INTERVALS[scale]
  const rootIndex = getNoteIndex(root)
  const degreeIndex = degree - 1
  const triadIndices = [degreeIndex, degreeIndex + 2, degreeIndex + 4]
  const chromaticOffsets = triadIndices.map((index) => {
    const octave = Math.floor(index / intervals.length)
    return intervals[index % intervals.length] + octave * 12
  })
  const [rootOffset, thirdOffset, fifthOffset] = chromaticOffsets
  const chordRoot = noteAtChromaticIndex(rootIndex + rootOffset)
  const quality = qualityFromIntervals(rootOffset, thirdOffset, fifthOffset)
  const rootMidi = ROOT_MIDI_C4 + rootIndex + rootOffset
  const midiNotes = [rootMidi, ROOT_MIDI_C4 + rootIndex + thirdOffset, ROOT_MIDI_C4 + rootIndex + fifthOffset]
  const suffix = quality === 'major' ? 'major' : quality === 'minor' ? 'minor' : 'diminished'

  return {
    degree,
    function: (scale === 'major' ? MAJOR_ROMAN_NUMERALS : NATURAL_MINOR_ROMAN_NUMERALS)[degreeIndex],
    root: chordRoot,
    quality,
    name: `${chordRoot} ${suffix}`,
    midiNotes,
    noteNames: midiNotes.map(noteNameWithOctave),
  }
}
