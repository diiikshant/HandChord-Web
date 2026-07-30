import type { CompositionTransport } from '../composition/CompositionTransport.ts'
import type { CompositionTransportSnapshot, CountInBars, LoopBars } from '../composition/compositionTypes.ts'

type Props = { transport: CompositionTransport; composition: CompositionTransportSnapshot }
function formatSeconds(seconds: number | undefined) { return seconds === undefined ? '—' : `${seconds.toFixed(2)} s` }

export function CompositionLoop({ transport, composition }: Props) {
  const isBusy = ['armed', 'countingIn', 'recordingLayer', 'processingLayer', 'replacingLayer'].includes(composition.state)
  const session = composition.composition
  const layers = session?.layers ?? []
  const update = <K extends keyof typeof composition.settings>(key: K, value: (typeof composition.settings)[K]) => { try { transport.updateSettings({ [key]: value }) } catch { /* transport exposes the validation message */ } }
  const action = async (work: () => Promise<void>) => { try { await work() } catch { /* transport exposes the validation message */ } }
  return <section className="composition-loop-panel reverb-panel" aria-labelledby="composition-loop-title">
    <div className="gesture-audio-heading"><div><p className="eyebrow">Session performance capture</p><h2 id="composition-loop-title">Composition Layers</h2></div><span className="audio-status">Transport: {composition.state}</span></div>
    <p className="gesture-audio-message">Records internal live performance only. Existing layers play as backing through their own composition bus, so they never enter the next layer’s recording tap.</p>
    {composition.error && <p className="audio-error" aria-live="polite">{composition.error}</p>}
    {composition.warning && <p className="audio-message">{composition.warning}</p>}
    <div className="audio-controls composition-controls">
      <label>BPM: {composition.settings.bpm}<input type="number" min="40" max="220" value={composition.settings.bpm} disabled={isBusy || layers.length > 0} onChange={(event) => update('bpm', Number(event.target.value))} /></label>
      <label>Loop length<select value={composition.settings.barCount} disabled={isBusy || layers.length > 0} onChange={(event) => update('barCount', Number(event.target.value) as LoopBars)}>{[1, 2, 4, 8].map((bars) => <option key={bars} value={bars}>{bars} bar{bars === 1 ? '' : 's'}</option>)}</select></label>
      <label>Count-in<select value={composition.settings.countInBars} disabled={isBusy} onChange={(event) => update('countInBars', Number(event.target.value) as CountInBars)}><option value={0}>Off</option><option value={1}>1 bar</option><option value={2}>2 bars</option></select></label>
      <label className="gesture-audio-toggle"><input type="checkbox" checked={composition.settings.metronomeEnabled} disabled={isBusy} onChange={(event) => update('metronomeEnabled', event.target.checked)} /> Metronome</label>
      <label>Metronome level: {Math.round(composition.settings.metronomeGain * 100)}%<input type="range" min="0" max="0.5" step="0.01" value={composition.settings.metronomeGain} disabled={isBusy} onChange={(event) => update('metronomeGain', Number(event.target.value))} /></label>
    </div>
    <div className="chord-buttons" aria-label="Composition transport controls">
      {!layers.length && !isBusy && <button className="primary-button" type="button" onClick={() => void action(() => transport.recordFirstLayer())}>Record First Layer</button>}
      {layers.length > 0 && !isBusy && <button className="primary-button" type="button" disabled={layers.length >= 4} onClick={() => void action(() => transport.addLayer())}>Add Layer</button>}
      {layers.length > 0 && !isBusy && composition.state !== 'playing' && <button className="secondary-button" type="button" onClick={() => { try { transport.playAll() } catch { /* transport message */ } }}>Play All</button>}
      {composition.state === 'playing' && <button className="secondary-button" type="button" onClick={() => transport.stopAllLayers()}>Stop</button>}
      {(composition.state === 'countingIn' || composition.state === 'armed' || composition.state === 'replacingLayer') && <button className="secondary-button" type="button" onClick={() => transport.cancelRecording('Count-in cancelled.')}>Cancel Count-in</button>}
      {composition.state === 'recordingLayer' && <button className="secondary-button" type="button" onClick={() => transport.cancelRecording('Layer recording cancelled; completed layers were kept.')}>Cancel Recording</button>}
      {layers.length > 0 && !isBusy && <button className="secondary-button" type="button" onClick={() => { if (window.confirm('Clear every composition layer? Personal Sounds are not affected.')) transport.clearComposition() }}>Clear Composition</button>}
      {composition.undoAction && !isBusy && <button className="secondary-button" type="button" onClick={() => transport.undoLastAction()}>Undo {composition.undoAction.replace('-', ' ')}</button>}
    </div>
    {composition.pendingSilentLayerId && <div className="composition-recording"><strong>Nearly silent layer</strong><span>Choose whether to keep this layer.</span><div className="chord-buttons"><button className="secondary-button" type="button" onClick={() => transport.keepPendingSilentLayer()}>Keep Layer</button><button className="secondary-button" type="button" onClick={() => void action(() => transport.recordAgainPendingLayer())}>Record Again</button><button className="secondary-button" type="button" onClick={() => transport.discardPendingSilentLayer()}>Cancel</button></div></div>}
    {composition.state === 'countingIn' && <div className="composition-countdown" aria-live="assertive"><strong>{5 - composition.currentBeat}</strong><span>Count-in · {composition.remainingCountInBars} bar{composition.remainingCountInBars === 1 ? '' : 's'} remaining</span></div>}
    {composition.state === 'recordingLayer' && <div className="composition-recording" aria-live="polite"><strong>Recording Layer {(layers.length + 1)}</strong><span>Backing: {composition.audibleLayerIds.length || 'none'} layer(s) · Bar {composition.currentBar} · Beat {composition.currentBeat}</span></div>}
    <div className="composition-layer-list" aria-label="Composition layers">
      {layers.map((layer) => <article key={layer.id} className={`composition-layer ${session?.activeLayerId === layer.id ? 'composition-layer-active' : ''}`}>
        <button className="composition-layer-select" type="button" onClick={() => transport.selectLayer(layer.id)}><strong>{layer.name}</strong><span>{layer.id === session?.activeLayerId ? 'Active' : 'Select'}</span></button>
        <div className="composition-layer-controls">
          <label><input type="checkbox" checked={layer.muted} onChange={(event) => transport.setLayerMuted(layer.id, event.target.checked)} /> Mute</label>
          <label><input type="checkbox" checked={layer.solo} onChange={(event) => transport.setLayerSolo(layer.id, event.target.checked)} /> Solo</label>
          <label>Volume {Math.round(layer.volume * 100)}%<input type="range" min="0" max="1.5" step="0.01" value={layer.volume} onChange={(event) => transport.setLayerVolume(layer.id, Number(event.target.value))} /></label>
          <button className="secondary-button" type="button" disabled={isBusy} onClick={() => { const name = window.prompt('Layer name', layer.name); if (name !== null) { transport.selectLayer(layer.id); try { transport.renameActiveLayer(name) } catch { /* validation displayed next action */ } } }}>Rename</button>
          <button className="secondary-button" type="button" disabled={isBusy} onClick={() => { transport.selectLayer(layer.id); void action(() => transport.replaceActiveLayer()) }}>Replace</button>
          <button className="secondary-button" type="button" disabled={isBusy} onClick={() => { if (window.confirm(`Delete ${layer.name}?`)) { transport.selectLayer(layer.id); transport.deleteActiveLayer() } }}>Delete</button>
        </div>
        <small>{formatSeconds(layer.durationSeconds)} · {layer.sourceSoundType === 'built-in' ? 'Built-in instrument' : 'Personal sound'} · {composition.runtimeBufferIds.includes(layer.id) ? `frames ${layer.frameCount}` : 'Audio unavailable — delete or repair this layer before playback'} · {new Date(layer.createdAt).toLocaleTimeString()}</small>
      </article>)}
    </div>
    <dl className="effect-readout" aria-label="Composition layer diagnostics">
      <div><dt>Composition ID</dt><dd>{session?.id ?? '—'}</dd></div><div><dt>Layers</dt><dd>{layers.length} / 4</dd></div><div><dt>Active layer</dt><dd>{session?.activeLayerId ?? '—'}</dd></div>
      <div><dt>Bar / beat</dt><dd>{composition.currentBar} / {composition.currentBeat}</dd></div><div><dt>Loop cycles</dt><dd>{composition.loopCycleCount}</dd></div><div><dt>Expected frames</dt><dd>{session?.expectedFrameCount ?? '—'}</dd></div>
      <div><dt>Audible layers</dt><dd>{composition.audibleLayerIds.join(', ') || '—'}</dd></div><div><dt>Muted / soloed</dt><dd>{composition.mutedLayerIds.length} / {composition.soloedLayerIds.length}</dd></div><div><dt>Source group</dt><dd>{composition.sourceGroupSize}</dd></div><div><dt>Shared start</dt><dd>{composition.sharedPlaybackStartTime?.toFixed(3) ?? '—'} s</dd></div><div><dt>Composition bus</dt><dd>{composition.compositionBusActive ? 'active' : 'inactive'}</dd></div><div><dt>Runtime buffers</dt><dd>{composition.runtimeBufferIds.length}</dd></div>
      <div><dt>AudioWorklet</dt><dd>{composition.workletStatus}</dd></div><div><dt>Recording tap</dt><dd>{composition.recordingTapActive ? 'Ready' : 'Off'}</dd></div><div><dt>Sampled-chord timing</dt><dd>Known issue remains unresolved</dd></div>
    </dl>
    <p className="gesture-audio-message">This composition is not saved after closing or refreshing this page.</p>
  </section>
}
