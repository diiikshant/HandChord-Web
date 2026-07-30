import { useMemo } from 'react'
import type { AudioEngine } from '../audio/AudioEngine.ts'
import { calculateNormalisationGain, createLoopSettings, createWaveformPeaks, parseRootNote, validateLoopRegion, validateTrim } from '../audio/sounds/sampleMath.ts'
import { DEFAULT_FADE_SECONDS, type PersonalSoundMode, type PersonalSoundSourceType } from '../audio/sounds/soundTypes.ts'
import { SampleWaveform } from './SampleWaveform.tsx'

export type SampleDraft = {
  name: string; originalFileName: string; originalMimeType: string | null; recordingDurationSeconds: number | null; sourceType: PersonalSoundSourceType; mode: PersonalSoundMode; rootNoteName: string; rootOctave: number
  trimStartSeconds: number; trimEndSeconds: number; fadeInSeconds: number; fadeOutSeconds: number
  normalise: boolean; reverse: boolean; loopEnabled: boolean; loopCrossfadeSeconds: number
}

type Props = {
  buffer: AudioBuffer; draft: SampleDraft; engine: AudioEngine; message: string | null
  onChange: (next: SampleDraft) => void; onSave: () => void; onCancel: () => void; onStopPreview: () => void
}

export function SampleEditor({ buffer, draft, engine, message, onChange, onSave, onCancel, onStopPreview }: Props) {
  const peaks = useMemo(() => createWaveformPeaks(buffer), [buffer])
  const rootMidi = parseRootNote(draft.rootNoteName, draft.rootOctave)
  const trim = validateTrim(draft.trimStartSeconds, draft.trimEndSeconds, buffer.duration)
  const loopValidation = validateLoopRegion(draft.trimStartSeconds, draft.trimEndSeconds, draft.trimStartSeconds, draft.trimEndSeconds)
  const preview = () => {
    if (!trim.ok || rootMidi === null) return
    const sound = {
      id: 'preview', name: draft.name, sourceType: draft.sourceType, mode: draft.mode, originalFileName: draft.originalFileName, originalMimeType: draft.originalMimeType, recordingDurationSeconds: draft.recordingDurationSeconds,
      rootMidiNote: rootMidi, trimStartSeconds: draft.trimStartSeconds, trimEndSeconds: draft.trimEndSeconds,
      fadeInSeconds: draft.fadeInSeconds, fadeOutSeconds: draft.fadeOutSeconds,
      normalisationGain: draft.normalise ? calculateNormalisationGain(buffer) : 1, reverse: draft.reverse,
      ...createLoopSettings(draft.mode, false, draft.trimStartSeconds, draft.trimEndSeconds, draft.loopCrossfadeSeconds),
      createdAt: Date.now(), modifiedAt: Date.now(),
    }
    try { engine.previewPersonalSound(sound, buffer) } catch { /* The surrounding panel displays the recovery message. */ }
  }
  return <section className="reverb-panel" aria-labelledby="sample-editor-title">
    <div className="gesture-audio-heading"><div><p className="eyebrow">{draft.sourceType === 'recorded' ? 'Local microphone recording' : 'Local sample editor'}</p><h2 id="sample-editor-title">{draft.originalFileName}</h2></div><button className="secondary-button" type="button" onClick={onCancel}>Cancel</button></div>
    <p className="gesture-audio-message">Trim and sound settings are saved as metadata with the original local audio file.</p>
    <SampleWaveform peaks={peaks} trimStart={draft.trimStartSeconds} trimEnd={draft.trimEndSeconds} duration={buffer.duration} />
    <div className="audio-controls">
      <label>Name<input value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} /></label>
      <label>Trim start: {draft.trimStartSeconds.toFixed(2)} s<input type="range" min="0" max={Math.max(0, draft.trimEndSeconds - 0.08)} step="0.01" value={draft.trimStartSeconds} onChange={(event) => onChange({ ...draft, trimStartSeconds: Number(event.target.value) })} /></label>
      <label>Trim end: {draft.trimEndSeconds.toFixed(2)} s<input type="range" min={Math.min(buffer.duration, draft.trimStartSeconds + 0.08)} max={buffer.duration} step="0.01" value={draft.trimEndSeconds} onChange={(event) => onChange({ ...draft, trimEndSeconds: Number(event.target.value) })} /></label>
      <label>Fade in<input type="number" min="0" max="0.25" step="0.005" value={draft.fadeInSeconds} onChange={(event) => onChange({ ...draft, fadeInSeconds: Number(event.target.value) || DEFAULT_FADE_SECONDS })} /></label>
      <label>Fade out<input type="number" min="0" max="0.25" step="0.005" value={draft.fadeOutSeconds} onChange={(event) => onChange({ ...draft, fadeOutSeconds: Number(event.target.value) || DEFAULT_FADE_SECONDS })} /></label>
      <label>Sound mode<select value={draft.mode} onChange={(event) => { const mode = event.target.value as PersonalSoundMode; onChange({ ...draft, mode, loopEnabled: mode === 'instrument' && draft.loopEnabled }) }}><option value="instrument">Play as Instrument</option><option value="one-shot">Trigger as One-shot</option></select></label>
      {draft.mode === 'instrument' && <><label>Root note<select value={draft.rootNoteName} onChange={(event) => onChange({ ...draft, rootNoteName: event.target.value })}>{['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].map((note) => <option key={note}>{note}</option>)}</select></label><label>Root octave<select value={draft.rootOctave} onChange={(event) => onChange({ ...draft, rootOctave: Number(event.target.value) })}>{[2, 3, 4, 5].map((octave) => <option key={octave}>{octave}</option>)}</select></label></>}
      <label><input type="checkbox" checked={draft.normalise} onChange={(event) => onChange({ ...draft, normalise: event.target.checked })} />Normalise volume</label>
      <label><input type="checkbox" checked={draft.reverse} onChange={(event) => onChange({ ...draft, reverse: event.target.checked })} />Reverse</label>
      {draft.mode === 'instrument' && <label><input type="checkbox" checked={draft.loopEnabled} onChange={(event) => onChange({ ...draft, loopEnabled: event.target.checked })} />Loop Sample</label>}
    </div>
    {draft.mode === 'instrument' && draft.loopEnabled && <p className="gesture-audio-message">Repeat the trimmed sample while the chord is playing. Loop region: {draft.trimStartSeconds.toFixed(2)}–{draft.trimEndSeconds.toFixed(2)} s. Debug edge fade: {(draft.loopCrossfadeSeconds * 1000).toFixed(0)} ms.</p>}
    {message && <p className="audio-error">{message}</p>}
    {!trim.ok && <p className="audio-error">{trim.reason}</p>}
    {draft.loopEnabled && !loopValidation.ok && <p className="audio-error">{loopValidation.reason}</p>}
    <div className="audio-actions"><button className="secondary-button" type="button" onClick={preview} disabled={!trim.ok || rootMidi === null}>Play Preview</button><button className="secondary-button" type="button" onClick={onStopPreview}>Stop Preview</button><button className="primary-button" type="button" onClick={onSave} disabled={!trim.ok || (draft.loopEnabled && !loopValidation.ok) || rootMidi === null || !draft.name.trim()}>Save Sound</button></div>
  </section>
}
