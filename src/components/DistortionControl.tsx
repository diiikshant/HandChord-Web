import type { useDistortionControl } from '../hooks/useDistortionControl.ts'

type Props = { distortion: ReturnType<typeof useDistortionControl> }

function format(value: number | null) {
  return value === null ? '—' : value.toFixed(2)
}

export function DistortionControl({ distortion }: Props) {
  return <section className="reverb-panel" aria-labelledby="distortion-title">
    <div className="gesture-audio-heading">
      <div><p className="eyebrow">Connected movement control</p><h2 id="distortion-title">Left-hand distortion</h2></div>
      <label className="gesture-audio-toggle">
        <input type="checkbox" checked={distortion.enabled} onChange={(event) => distortion.setEnabled(event.target.checked)} />
        Distortion Control: {distortion.enabled ? 'On' : 'Off'}
      </label>
    </div>
    <p className="gesture-audio-message">{distortion.status}</p>
    <dl className="gesture-audio-readout">
      <div><dt>Raw leftHorizontal</dt><dd>{format(distortion.rawValue)}</dd></div>
      <div><dt>Curved distortion value</dt><dd>{format(distortion.curvedValue)}</dd></div>
      <div><dt>Final wet percentage</dt><dd>{Math.round(distortion.wet * 100)}%</dd></div>
      <div><dt>Left horizontal calibration</dt><dd>{distortion.calibrated ? 'Ready' : 'Missing'}</dd></div>
      <div><dt>Oversampling mode</dt><dd>{distortion.oversample}</dd></div>
      <div><dt>Gain compensation</dt><dd>{distortion.gainCompensation}</dd></div>
    </dl>
  </section>
}
