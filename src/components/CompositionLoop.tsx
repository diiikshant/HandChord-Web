import type { CompositionTransport } from '../composition/CompositionTransport.ts'
import type { CompositionTransportSnapshot, CountInBars, LoopBars } from '../composition/compositionTypes.ts'

type Props = { transport: CompositionTransport; composition: CompositionTransportSnapshot }

function formatSeconds(seconds: number | undefined) { return seconds === undefined ? '—' : `${seconds.toFixed(2)} s` }

export function CompositionLoop({ transport, composition }: Props) {
  const isBusy = ['armed', 'countingIn', 'recording', 'processing'].includes(composition.state)
  const hasLoop = composition.loop !== null
  const update = <K extends keyof typeof composition.settings>(key: K, value: (typeof composition.settings)[K]) => {
    try { transport.updateSettings({ [key]: value }) } catch { /* The transport publishes its state after the action is available again. */ }
  }
  const record = async (replace: boolean) => { try { await transport.record(replace) } catch { /* The transport exposes its recovery message below. */ } }
  const play = () => { try { transport.playLoop() } catch { /* The transport exposes its recovery message below. */ } }

  return <section className="composition-loop-panel reverb-panel" aria-labelledby="composition-loop-title">
    <div className="gesture-audio-heading">
      <div><p className="eyebrow">Session performance capture</p><h2 id="composition-loop-title">Composition Loop</h2></div>
      <span className="audio-status">Transport: {composition.state}</span>
    </div>
    <p className="gesture-audio-message">Records HandChord’s internal instrument and effects only. The metronome, manual master level, final compressor, microphone, and existing loop playback are excluded.</p>
    <p className="audio-error" aria-live="polite">{composition.error}</p>
    {composition.warning && <p className="audio-message">{composition.warning}</p>}
    <div className="audio-controls composition-controls">
      <label>BPM: {composition.settings.bpm}<input type="number" min="40" max="220" value={composition.settings.bpm} disabled={isBusy} onChange={(event) => update('bpm', Number(event.target.value))} /></label>
      <label>Loop length<select value={composition.settings.barCount} disabled={isBusy} onChange={(event) => update('barCount', Number(event.target.value) as LoopBars)}>{[1, 2, 4, 8].map((bars) => <option key={bars} value={bars}>{bars} bar{bars === 1 ? '' : 's'}</option>)}</select></label>
      <label>Count-in<select value={composition.settings.countInBars} disabled={isBusy} onChange={(event) => update('countInBars', Number(event.target.value) as CountInBars)}><option value={0}>Off</option><option value={1}>1 bar</option><option value={2}>2 bars</option></select></label>
      <label className="gesture-audio-toggle"><input type="checkbox" checked={composition.settings.metronomeEnabled} disabled={isBusy} onChange={(event) => update('metronomeEnabled', event.target.checked)} /> Metronome</label>
      <label>Metronome level: {Math.round(composition.settings.metronomeGain * 100)}%<input type="range" min="0" max="0.5" step="0.01" value={composition.settings.metronomeGain} disabled={isBusy} onChange={(event) => update('metronomeGain', Number(event.target.value))} /></label>
    </div>
    <div className="chord-buttons" aria-label="Composition loop transport controls">
      {!hasLoop && !isBusy && <button className="primary-button" type="button" onClick={() => void record(false)}>Record Loop</button>}
      {hasLoop && !isBusy && <button className="primary-button" type="button" onClick={() => void record(true)}>Re-record Loop</button>}
      {(composition.state === 'countingIn' || composition.state === 'armed') && <button className="secondary-button" type="button" onClick={() => transport.cancelRecording('Count-in cancelled.')}>Cancel Count-in</button>}
      {composition.state === 'recording' && <button className="secondary-button" type="button" onClick={() => transport.cancelRecording('Recording stopped before the loop boundary; the previous loop was kept.')}>Stop Recording</button>}
      {hasLoop && composition.state !== 'playing' && !isBusy && <button className="secondary-button" type="button" onClick={play}>Play Loop</button>}
      {composition.state === 'playing' && <button className="secondary-button" type="button" onClick={() => transport.stopLoop()}>Stop Loop</button>}
      {hasLoop && !isBusy && <button className="secondary-button" type="button" onClick={() => transport.clearLoop()}>Clear Loop</button>}
      {composition.undoLoop && !isBusy && <button className="secondary-button" type="button" onClick={() => transport.undo()}>Undo</button>}
    </div>
    {composition.state === 'countingIn' && <div className="composition-countdown" aria-live="assertive"><strong>{5 - composition.currentBeat}</strong><span>Count-in · {composition.remainingCountInBars} bar{composition.remainingCountInBars === 1 ? '' : 's'} remaining</span></div>}
    {composition.state === 'recording' && <div className="composition-recording" aria-live="polite"><strong>Recording</strong><span>Bar {composition.currentBar} · Beat {composition.currentBeat}</span><span>Ends at {formatSeconds(composition.schedule?.recordingEndTime)}</span></div>}
    <dl className="effect-readout" aria-label="Composition loop diagnostics">
      <div><dt>Bar / beat</dt><dd>{composition.currentBar} / {composition.currentBeat}</dd></div>
      <div><dt>Count-in bars left</dt><dd>{composition.remainingCountInBars || '—'}</dd></div>
      <div><dt>Loop cycles</dt><dd>{composition.loopCycleCount}</dd></div>
      <div><dt>Loop duration</dt><dd>{formatSeconds(composition.loop?.metadata.durationSeconds)}</dd></div>
      <div><dt>AudioWorklet</dt><dd>{composition.workletStatus}</dd></div>
      <div><dt>Recording tap</dt><dd>{composition.recordingTapActive ? 'Ready' : 'Off'}</dd></div>
      <div><dt>Expected frames</dt><dd>{composition.schedule?.expectedFrameCount ?? '—'}</dd></div>
      <div><dt>Received frames</dt><dd>{composition.receivedFrameCount || '—'}</dd></div>
      <div><dt>Boundary crossfade</dt><dd>{composition.loop ? `${(composition.loop.metadata.boundaryCrossfadeDuration * 1000).toFixed(0)} ms` : '—'}</dd></div>
      <div><dt>Sampled-chord timing</dt><dd>Known issue remains unresolved</dd></div>
    </dl>
    <p className="gesture-audio-message">Loop is not saved after closing or refreshing this page.</p>
  </section>
}
