import type { useReverbControl } from '../hooks/useReverbControl.ts'

type ReverbProps = { reverb: ReturnType<typeof useReverbControl> }
function format(value: number | null) { return value === null ? '—' : value.toFixed(2) }

export function ReverbControl({ reverb }: ReverbProps) {
  return <section className="reverb-panel" aria-labelledby="reverb-title">
    <div className="gesture-audio-heading"><div><p className="eyebrow">Connected movement control</p><h2 id="reverb-title">Left-hand reverb</h2></div>
      <label className="gesture-audio-toggle"><input type="checkbox" checked={reverb.enabled} onChange={(event) => reverb.setEnabled(event.target.checked)} />Reverb Control: {reverb.enabled ? 'On' : 'Off'}</label>
    </div>
    <p className="gesture-audio-message">{reverb.status}</p>
    <dl className="gesture-audio-readout">
      <div><dt>Raw leftVertical</dt><dd>{format(reverb.rawValue)}</dd></div>
      <div><dt>Curved reverb value</dt><dd>{format(reverb.curvedValue)}</dd></div>
      <div><dt>Final wet percentage</dt><dd>{Math.round(reverb.wet * 100)}%</dd></div>
      <div><dt>Reverb decay duration</dt><dd>{reverb.decaySeconds} seconds</dd></div>
      <div><dt>Left vertical calibration</dt><dd>{reverb.calibrated ? 'Ready' : 'Missing'}</dd></div>
    </dl>
  </section>
}
