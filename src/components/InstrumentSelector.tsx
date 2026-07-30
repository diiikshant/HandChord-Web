import { INSTRUMENT_PRESETS } from '../audio/instruments/instrumentPresets.ts'
import type { InstrumentDefinition, InstrumentId } from '../audio/instruments/instrumentTypes.ts'

type Props = { instrument: InstrumentDefinition; activeVoiceCount: number; onSelect: (id: InstrumentId) => void; title?: string }

export function InstrumentSelector({ instrument, activeVoiceCount, onSelect, title = 'Built-in instrument' }: Props) {
  const headingId = title === 'Audio Test instrument' ? 'audio-test-instrument-title' : 'camera-instrument-title'
  return <section className="reverb-panel" aria-labelledby={headingId}>
    <div className="gesture-audio-heading"><div><p className="eyebrow">Built-in sound</p><h2 id={headingId}>{title}</h2></div><p className="model-badge model-ready">Active: {instrument.name}</p></div>
    <p className="gesture-audio-message">{instrument.description}</p>
    <div className="chord-buttons" aria-label="Built-in instrument selector">
      {INSTRUMENT_PRESETS.map((option) => <button key={option.id} className="chord-button" type="button" aria-pressed={option.id === instrument.id} onClick={() => onSelect(option.id)}>{option.name}</button>)}
    </div>
    <dl className="gesture-audio-readout">
      <div><dt>Instrument ID</dt><dd>{instrument.id}</dd></div>
      <div><dt>Waveforms</dt><dd>{instrument.oscillators.map((oscillator) => oscillator.waveform).join(' + ')}</dd></div>
      <div><dt>Envelope</dt><dd>A {instrument.envelope.attackSeconds}s · D {instrument.envelope.decaySeconds}s · S {instrument.envelope.sustainLevel} · R {instrument.envelope.releaseSeconds}s</dd></div>
      <div><dt>Octave offset</dt><dd>{instrument.octaveOffset >= 0 ? '+' : ''}{instrument.octaveOffset}</dd></div>
      <div><dt>Gain compensation</dt><dd>{Math.round(instrument.gainCompensation * 100)}%</dd></div>
      <div><dt>Active voices</dt><dd>{activeVoiceCount}</dd></div>
    </dl>
  </section>
}
