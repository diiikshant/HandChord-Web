type Props = { peaks: number[]; trimStart: number; trimEnd: number; duration: number }

export function SampleWaveform({ peaks, trimStart, trimEnd, duration }: Props) {
  const start = duration > 0 ? (trimStart / duration) * 100 : 0
  const end = duration > 0 ? (trimEnd / duration) * 100 : 100
  return <div aria-label="Sample waveform">
    <svg viewBox="0 0 160 48" role="img" aria-label="Downsampled audio waveform" style={{ width: '100%', display: 'block' }}>
      {peaks.map((peak, index) => <line key={index} x1={index + 0.5} x2={index + 0.5} y1={24 - peak * 22} y2={24 + peak * 22} stroke="currentColor" strokeWidth="0.8" />)}
      <rect x={start * 1.6} y="1" width={Math.max(1, (end - start) * 1.6)} height="46" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  </div>
}
