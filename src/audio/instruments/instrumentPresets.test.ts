import assert from 'node:assert/strict'
import test from 'node:test'
import { applyInstrumentOctave, DEFAULT_INSTRUMENT_ID, getInstrument, INSTRUMENT_PRESETS } from './instrumentPresets.ts'
import { loadInstrumentId, saveInstrumentId } from './instrumentStorage.ts'

test('uses Warm Pad as the default and defines unique valid instrument presets', () => {
  assert.equal(DEFAULT_INSTRUMENT_ID, 'warm-pad')
  assert.equal(getInstrument('invalid').id, 'warm-pad')
  assert.equal(new Set(INSTRUMENT_PRESETS.map((instrument) => instrument.id)).size, INSTRUMENT_PRESETS.length)
  for (const instrument of INSTRUMENT_PRESETS) {
    assert.ok(instrument.oscillators.length > 0)
    assert.ok(instrument.envelope.attackSeconds >= 0 && instrument.envelope.releaseSeconds > 0)
    assert.ok(instrument.envelope.decaySeconds >= 0 && instrument.envelope.sustainLevel >= 0 && instrument.envelope.sustainLevel <= 1)
    assert.ok(instrument.filter.frequencyHz >= 200 && instrument.filter.frequencyHz <= 12000)
    assert.ok(instrument.gainCompensation > 0 && instrument.gainCompensation <= 0.2)
  }
})

test('applies octave offsets without creating invalid Deep Bass MIDI notes', () => {
  assert.equal(applyInstrumentOctave(60, getInstrument('deep-bass')), 48)
  assert.ok(applyInstrumentOctave(36, getInstrument('deep-bass')) > 0)
  assert.equal(applyInstrumentOctave(60, getInstrument('warm-pad')), 60)
})

test('keeps the Pluck voice short rather than sustained', () => {
  const pluck = getInstrument('pluck')
  assert.ok(pluck.envelope.attackSeconds <= 0.01)
  assert.ok(pluck.envelope.sustainLevel <= 0.05)
  assert.ok(pluck.envelope.releaseSeconds <= 0.2)
  assert.equal(pluck.autoReleaseSeconds, 0.45)
})

test('persists a valid selection and safely falls back from invalid stored data', () => {
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }
  saveInstrumentId('organ', storage)
  assert.equal(loadInstrumentId(storage), 'organ')
  values.set('handchord-active-instrument-v1', 'not-an-instrument')
  assert.equal(loadInstrumentId(storage), 'warm-pad')
})
