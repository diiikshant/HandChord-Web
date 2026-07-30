import type { InstrumentDefinition, InstrumentId } from './instrumentTypes.ts'

export const DEFAULT_INSTRUMENT_ID: InstrumentId = 'warm-pad'

export const INSTRUMENT_PRESETS: readonly InstrumentDefinition[] = [
  {
    id: 'warm-pad', name: 'Warm Pad', description: 'Soft, spacious chords with a slow bloom.',
    oscillators: [{ waveform: 'triangle', level: 0.75, detuneCents: -6 }, { waveform: 'sawtooth', level: 0.25, detuneCents: 6 }],
    envelope: { attackSeconds: 0.18, decaySeconds: 0.32, sustainLevel: 0.72, releaseSeconds: 0.9 },
    filter: { frequencyHz: 2200, q: 0.7 }, octaveOffset: 0, gainCompensation: 0.11,
  },
  {
    id: 'soft-keys', name: 'Soft Keys', description: 'Rounded keys with a gentle, clear attack.',
    oscillators: [{ waveform: 'sine', level: 0.72, detuneCents: 0 }, { waveform: 'triangle', level: 0.35, detuneCents: 3 }],
    envelope: { attackSeconds: 0.025, decaySeconds: 0.24, sustainLevel: 0.55, releaseSeconds: 0.35 },
    filter: { frequencyHz: 3600, q: 0.55 }, octaveOffset: 0, gainCompensation: 0.13,
  },
  {
    id: 'pluck', name: 'Pluck', description: 'Bright, short notes that decay naturally.',
    oscillators: [{ waveform: 'triangle', level: 0.7, detuneCents: 0 }, { waveform: 'sawtooth', level: 0.25, detuneCents: 4 }],
    envelope: { attackSeconds: 0.008, decaySeconds: 0.18, sustainLevel: 0.05, releaseSeconds: 0.18 },
    filter: { frequencyHz: 5200, q: 0.45 }, octaveOffset: 0, gainCompensation: 0.12, autoReleaseSeconds: 0.45,
  },
  {
    id: 'organ', name: 'Organ', description: 'A steady harmonic chord voice with full sustain.',
    oscillators: [{ waveform: 'sine', level: 0.55, detuneCents: 0 }, { waveform: 'triangle', level: 0.28, detuneCents: 0 }, { waveform: 'sawtooth', level: 0.12, detuneCents: 7 }],
    envelope: { attackSeconds: 0.02, decaySeconds: 0.08, sustainLevel: 0.94, releaseSeconds: 0.42 },
    filter: { frequencyHz: 4200, q: 0.45 }, octaveOffset: 0, gainCompensation: 0.08,
  },
  {
    id: 'deep-bass', name: 'Deep Bass', description: 'A controlled lower-register foundation.',
    oscillators: [{ waveform: 'sine', level: 0.78, detuneCents: 0 }, { waveform: 'triangle', level: 0.3, detuneCents: -3 }],
    envelope: { attackSeconds: 0.018, decaySeconds: 0.16, sustainLevel: 0.82, releaseSeconds: 0.3 },
    filter: { frequencyHz: 900, q: 0.8 }, octaveOffset: -1, gainCompensation: 0.09,
  },
] as const

export function getInstrument(id: string | null | undefined): InstrumentDefinition {
  return INSTRUMENT_PRESETS.find((instrument) => instrument.id === id) ?? INSTRUMENT_PRESETS[0]
}

export function isInstrumentId(value: unknown): value is InstrumentId {
  return typeof value === 'string' && INSTRUMENT_PRESETS.some((instrument) => instrument.id === value)
}

export function applyInstrumentOctave(midiNote: number, instrument: InstrumentDefinition) {
  return midiNote + instrument.octaveOffset * 12
}
