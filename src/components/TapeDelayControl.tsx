import type { useTapeDelayControl } from '../hooks/useTapeDelayControl.ts'

type Props = { tapeDelay: ReturnType<typeof useTapeDelayControl>; manualMasterVolume: number }

export function TapeDelayControl({ tapeDelay, manualMasterVolume }: Props) {
  const { parameters } = tapeDelay
  return <section className="reverb-panel" aria-labelledby="tape-delay-title">
    <div className="gesture-audio-heading">
      <div><p className="eyebrow">Connected movement control</p><h2 id="tape-delay-title">Right-hand tape delay</h2></div>
      <label className="gesture-audio-toggle">
        <input type="checkbox" checked={tapeDelay.enabled} onChange={(event) => tapeDelay.setEnabled(event.target.checked)} />
        Tape Delay Control: {tapeDelay.enabled ? 'On' : 'Off'}
      </label>
    </div>
    <p className="gesture-audio-message">{tapeDelay.status}</p>
    <dl className="gesture-audio-readout">
      <div><dt>Raw rightVertical</dt><dd>{tapeDelay.rawValue === null ? '—' : tapeDelay.rawValue.toFixed(2)}</dd></div>
      <div><dt>Curved rightVertical</dt><dd>{tapeDelay.rawValue === null ? '—' : parameters.curved.toFixed(2)}</dd></div>
      <div><dt>Tape Delay percentage</dt><dd>{Math.round(parameters.wet * 100)}%</dd></div>
      <div><dt>Delay time</dt><dd>{Math.round(parameters.delayTimeSeconds * 1000)} ms</dd></div>
      <div><dt>Feedback</dt><dd>{Math.round(parameters.feedback * 100)}%</dd></div>
      <div><dt>Tape Delay calibration</dt><dd>{tapeDelay.calibrated ? 'Ready' : 'Missing'}</dd></div>
      <div><dt>Repeat filter cutoff</dt><dd>{parameters.filterCutoffHz} Hz</dd></div>
      <div><dt>Delay graph</dt><dd>{tapeDelay.graphActive}</dd></div>
      <div><dt>Fixed performance gain</dt><dd>100%</dd></div>
      <div><dt>Manual master gain</dt><dd>{Math.round(manualMasterVolume * 100)}%</dd></div>
    </dl>
  </section>
}
