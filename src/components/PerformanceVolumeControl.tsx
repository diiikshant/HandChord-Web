import type { usePerformanceVolumeControl } from '../hooks/usePerformanceVolumeControl.ts'
type Props = { volume: ReturnType<typeof usePerformanceVolumeControl>; manualMasterVolume: number }
export function PerformanceVolumeControl({ volume, manualMasterVolume }: Props) {
  return <section className="reverb-panel" aria-labelledby="performance-volume-title"><div className="gesture-audio-heading"><div><p className="eyebrow">Connected movement control</p><h2 id="performance-volume-title">Right-hand performance volume</h2></div>
    <label className="gesture-audio-toggle"><input type="checkbox" checked={volume.enabled} onChange={(event) => volume.setEnabled(event.target.checked)} />Performance Volume Control: {volume.enabled ? 'On' : 'Off'}</label></div>
    <p className="gesture-audio-message">{volume.status}</p><dl className="gesture-audio-readout">
      <div><dt>Raw rightVertical</dt><dd>{volume.rawValue === null ? '—' : volume.rawValue.toFixed(2)}</dd></div><div><dt>Mapped performance gain</dt><dd>{volume.gain.toFixed(2)}</dd></div><div><dt>Performance volume</dt><dd>{Math.round(volume.gain * 100)}%</dd></div><div><dt>Right vertical calibration</dt><dd>{volume.calibrated ? 'Ready' : 'Missing'}</dd></div><div><dt>Manual master volume</dt><dd>{Math.round(manualMasterVolume * 100)}%</dd></div><div><dt>Effective output</dt><dd>{Math.round(volume.combined * 100)}%</dd></div>
    </dl></section>
}
