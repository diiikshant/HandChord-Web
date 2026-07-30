import type { useChorusControl } from '../hooks/useChorusControl.ts'

type Props = { chorus: ReturnType<typeof useChorusControl> }

function format(value: number | null) {
  return value === null ? '—' : value.toFixed(2)
}

export function ChorusControl({ chorus }: Props) {
  return <section className="reverb-panel" aria-labelledby="chorus-title">
    <div className="gesture-audio-heading">
      <div><p className="eyebrow">Connected movement control</p><h2 id="chorus-title">Right-hand chorus width</h2></div>
      <label className="gesture-audio-toggle">
        <input type="checkbox" checked={chorus.enabled} onChange={(event) => chorus.setEnabled(event.target.checked)} />
        Chorus Control: {chorus.enabled ? 'On' : 'Off'}
      </label>
    </div>
    <p className="gesture-audio-message">{chorus.status}</p>
    <p className="gesture-audio-message">Move the right hand inward or left for more chorus. Move it outward or right for less chorus.</p>
    <dl className="gesture-audio-readout">
      <div><dt>Raw rightHorizontal</dt><dd>{format(chorus.rawValue)}</dd></div>
      <div><dt>Curved chorus value</dt><dd>{format(chorus.curvedValue)}</dd></div>
      <div><dt>Final wet percentage</dt><dd>{Math.round(chorus.wet * 100)}%</dd></div>
      <div><dt>Right horizontal calibration</dt><dd>{chorus.calibrated ? 'Ready' : 'Missing'}</dd></div>
      <div><dt>Base delay</dt><dd>{chorus.baseDelay}</dd></div>
      <div><dt>Modulation depth</dt><dd>{chorus.modulationDepth}</dd></div>
      <div><dt>Modulation rates</dt><dd>{chorus.modulationRates}</dd></div>
      <div><dt>Gain compensation</dt><dd>{chorus.gainCompensation}</dd></div>
      <div><dt>Chorus graph</dt><dd>{chorus.graphActive}</dd></div>
    </dl>
  </section>
}
