import {
  generateChromaticTriad,
  generateDiatonicTriad,
  generateSecondaryDominant,
  type GeneratedChord,
  type RootKey,
  type ScaleName,
} from '../music/MusicTheoryEngine.ts'
import type { CanonicalGesture } from '../gestures/fingerState.ts'

export type ChordBank = 'primary' | 'secondary'

export type GestureChordMapping = {
  id: string
  bank: ChordBank
  position: number
  chord: GeneratedChord
}

export type GestureMappingResult =
  | { kind: 'mapped'; mapping: GestureChordMapping }
  | { kind: 'unsupported'; reason: string }
  | { kind: 'waiting' }

function positionFromGesture(gesture: CanonicalGesture | null) {
  const positions: Partial<Record<CanonicalGesture, number>> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    'open-palm': 5,
  }
  return gesture ? positions[gesture] ?? null : null
}

function bankFromGesture(gesture: CanonicalGesture | null): ChordBank | null {
  if (gesture === 'open-palm') {
    return 'primary'
  }
  if (gesture === 'one') {
    return 'secondary'
  }
  return null
}

export function mapGestureChord(
  root: RootKey,
  scale: ScaleName,
  leftGesture: CanonicalGesture | null,
  rightGesture: CanonicalGesture | null,
): GestureMappingResult {
  const position = positionFromGesture(leftGesture)
  if (!position) {
    return leftGesture ? { kind: 'unsupported', reason: 'left-hand gesture does not select a chord position' } : { kind: 'waiting' }
  }

  const bank = bankFromGesture(rightGesture)
  if (!bank) {
    return rightGesture ? { kind: 'unsupported', reason: 'right-hand gesture does not select a chord bank' } : { kind: 'waiting' }
  }

  let chord: GeneratedChord
  if (bank === 'primary') {
    chord = generateDiatonicTriad(root, scale, position)
  } else {
    switch (position) {
      case 1:
        chord = generateDiatonicTriad(root, scale, 6)
        break
      case 2:
        chord = generateDiatonicTriad(root, scale, 7)
        break
      case 3:
        chord = generateChromaticTriad(root, 10, 'major', '♭VII')
        break
      case 4:
        chord = generateChromaticTriad(root, 5, 'minor', 'iv')
        break
      case 5:
        chord = generateSecondaryDominant(root, scale, 6)
        break
      default:
        return { kind: 'unsupported', reason: 'left-hand position is unsupported' }
    }
  }

  return {
    kind: 'mapped',
    mapping: {
      id: `${root}-${scale}-${bank}-${position}`,
      bank,
      position,
      chord,
    },
  }
}
