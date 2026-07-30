import { useEffect, useState } from 'react'
import type { AudioEngine } from '../audio/AudioEngine.ts'
import { calculateNormalisationGain, createLoopSettings, parseRootNote, validateAudioFile, validateDuration, validateLoopRegion } from '../audio/sounds/sampleMath.ts'
import { deletePersonalSound, getPersonalSound, listPersonalSounds, savePersonalSound } from '../audio/sounds/personalSoundStorage.ts'
import { DEFAULT_FADE_SECONDS, DEFAULT_LOOP_CROSSFADE_SECONDS, type PersonalSound } from '../audio/sounds/soundTypes.ts'
import { SampleEditor, type SampleDraft } from './SampleEditor.tsx'
import { RecordingPanel, type RecordedSample } from './RecordingPanel.tsx'

type EditorState = { buffer: AudioBuffer; audioData: ArrayBuffer; draft: SampleDraft; editingId?: string; createdAt?: number }
type Props = { engine: AudioEngine; onBeforeSourceChange: () => void; onSourceSelected?: () => void }

function newId() { return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `sound-${Date.now()}-${Math.random().toString(16).slice(2)}` }

export function PersonalSounds({ engine, onBeforeSourceChange, onSourceSelected }: Props) {
  const [sounds, setSounds] = useState<PersonalSound[]>([])
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [databaseStatus, setDatabaseStatus] = useState('Loading local sound library…')
  const [showRecorder, setShowRecorder] = useState(false)

  const refresh = async () => {
    try {
      setSounds(await listPersonalSounds())
      setDatabaseStatus('IndexedDB ready')
    } catch (error) {
      setDatabaseStatus('IndexedDB unavailable')
      setMessage(error instanceof Error ? error.message : 'Could not load personal sounds.')
    }
  }
  useEffect(() => { void refresh() }, [])

  const importFile = async (file: File | undefined) => {
    if (!file) return
    const validation = validateAudioFile(file)
    if (!validation.ok) { setMessage(validation.reason); return }
    try {
      const audioData = await file.arrayBuffer()
      const buffer = await engine.decodeAudioData(audioData)
      const duration = validateDuration(buffer.duration)
      if (!duration.ok) { setMessage(duration.reason); return }
      setEditor({ buffer, audioData, draft: { name: file.name.replace(/\.[^.]+$/, ''), originalFileName: file.name, originalMimeType: file.type || null, recordingDurationSeconds: null, sourceType: 'personal-sample', mode: 'instrument', rootNoteName: 'C', rootOctave: 4, trimStartSeconds: 0, trimEndSeconds: buffer.duration, fadeInSeconds: DEFAULT_FADE_SECONDS, fadeOutSeconds: DEFAULT_FADE_SECONDS, normalise: true, reverse: false, loopEnabled: false, loopCrossfadeSeconds: DEFAULT_LOOP_CROSSFADE_SECONDS } })
      setMessage(null)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The selected audio file could not be imported.') }
  }

  const useRecording = (recording: RecordedSample) => {
    const capturedAt = new Date().toLocaleString().replace(/[/:,\s]+/g, '-')
    setEditor({
      buffer: recording.buffer,
      audioData: recording.audioData,
      draft: {
        name: `Recording ${capturedAt}`,
        originalFileName: `recording-${capturedAt}.${recording.mimeType.includes('ogg') ? 'ogg' : 'webm'}`,
        originalMimeType: recording.mimeType || null,
        recordingDurationSeconds: recording.durationSeconds,
        sourceType: 'recorded',
        mode: 'instrument', rootNoteName: 'C', rootOctave: 4,
        trimStartSeconds: recording.silence.trimStartSeconds,
        trimEndSeconds: recording.silence.trimEndSeconds,
        fadeInSeconds: DEFAULT_FADE_SECONDS, fadeOutSeconds: DEFAULT_FADE_SECONDS,
        normalise: !recording.silence.nearlySilent, reverse: false, loopEnabled: false, loopCrossfadeSeconds: DEFAULT_LOOP_CROSSFADE_SECONDS,
      },
    })
    setShowRecorder(false)
    setMessage(recording.silence.nearlySilent ? 'Recording is nearly silent. You can re-record or edit it without normalising.' : 'Recording opened in the sample editor with a suggested silence trim.')
  }

  const selectSound = async (sound: PersonalSound) => {
    try {
      const record = await getPersonalSound(sound.id)
      if (!record) throw new Error('This saved sound is missing its audio data. Choose another sound or delete it.')
      const buffer = await engine.decodeAudioData(record.audioData)
      onBeforeSourceChange()
      engine.setPersonalSound(record, buffer)
      onSourceSelected?.()
      setActiveId(sound.id)
      setMessage(`Active personal sound: ${sound.name}`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not select this personal sound.') }
  }

  const saveEditor = async () => {
    if (!editor) return
    const rootMidiNote = parseRootNote(editor.draft.rootNoteName, editor.draft.rootOctave)
    if (rootMidiNote === null) { setMessage('Choose a valid root note and octave.'); return }
    const loopValidation = validateLoopRegion(editor.draft.trimStartSeconds, editor.draft.trimEndSeconds, editor.draft.trimStartSeconds, editor.draft.trimEndSeconds)
    if (editor.draft.loopEnabled && !loopValidation.ok) { setMessage(loopValidation.reason); return }
    const loop = createLoopSettings(editor.draft.mode, editor.draft.loopEnabled, editor.draft.trimStartSeconds, editor.draft.trimEndSeconds, editor.draft.loopCrossfadeSeconds)
    const now = Date.now()
    const sound = { id: editor.editingId ?? newId(), name: editor.draft.name.trim(), sourceType: editor.draft.sourceType, mode: editor.draft.mode, originalFileName: editor.draft.originalFileName, originalMimeType: editor.draft.originalMimeType, recordingDurationSeconds: editor.draft.recordingDurationSeconds, rootMidiNote, trimStartSeconds: editor.draft.trimStartSeconds, trimEndSeconds: editor.draft.trimEndSeconds, fadeInSeconds: editor.draft.fadeInSeconds, fadeOutSeconds: editor.draft.fadeOutSeconds, normalisationGain: editor.draft.normalise ? calculateNormalisationGain(editor.buffer) : 1, reverse: editor.draft.reverse, ...loop, createdAt: editor.createdAt ?? now, modifiedAt: now }
    try {
      await savePersonalSound({ ...sound, audioData: editor.audioData })
      setEditor(null); await refresh(); await selectSound(sound)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save this personal sound.') }
  }

  const rename = async (sound: PersonalSound) => {
    const name = window.prompt('New personal sound name', sound.name)?.trim()
    if (!name) return
    const record = await getPersonalSound(sound.id)
    if (!record) { setMessage('This sound is missing its audio data.'); return }
    await savePersonalSound({ ...record, name, modifiedAt: Date.now() }); await refresh()
  }
  const duplicate = async (sound: PersonalSound) => {
    const record = await getPersonalSound(sound.id)
    if (!record) { setMessage('This sound is missing its audio data.'); return }
    await savePersonalSound({ ...record, id: newId(), name: `${record.name} copy`, audioData: record.audioData.slice(0), createdAt: Date.now(), modifiedAt: Date.now() }); await refresh()
  }
  const remove = async (sound: PersonalSound) => {
    if (!window.confirm(`Delete ${sound.name}? This removes its local audio data.`)) return
    try { await deletePersonalSound(sound.id); if (activeId === sound.id) { onBeforeSourceChange(); engine.setInstrument('warm-pad'); setActiveId(null); onSourceSelected?.() } await refresh() }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not delete this personal sound.') }
  }
  const preview = async (sound: PersonalSound) => {
    const record = await getPersonalSound(sound.id)
    if (!record) { setMessage('This sound is missing its audio data.'); return }
    try { engine.previewPersonalSound(record, await engine.decodeAudioData(record.audioData)) } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not preview this sound.') }
  }
  const edit = async (sound: PersonalSound) => {
    try {
      const record = await getPersonalSound(sound.id)
      if (!record) throw new Error('This sound is missing its audio data.')
      const buffer = await engine.decodeAudioData(record.audioData)
      const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
      setEditor({ buffer, audioData: record.audioData, editingId: record.id, createdAt: record.createdAt, draft: { name: record.name, originalFileName: record.originalFileName, originalMimeType: record.originalMimeType, recordingDurationSeconds: record.recordingDurationSeconds, sourceType: record.sourceType, mode: record.mode, rootNoteName: names[record.rootMidiNote % 12], rootOctave: Math.floor(record.rootMidiNote / 12) - 1, trimStartSeconds: record.trimStartSeconds, trimEndSeconds: record.trimEndSeconds, fadeInSeconds: record.fadeInSeconds, fadeOutSeconds: record.fadeOutSeconds, normalise: record.normalisationGain !== 1, reverse: record.reverse, loopEnabled: record.loopEnabled, loopCrossfadeSeconds: record.loopCrossfadeSeconds } })
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not edit this personal sound.') }
  }

  const activeSound = sounds.find((sound) => sound.id === activeId) ?? null
  const activeSource = engine.getActiveSoundSource()
  const activePlaybackRates = engine.getSamplePlaybackRates()
  const sampleVoiceGroup = engine.getSampleVoiceGroupDiagnostics()

  return <section className="reverb-panel" aria-labelledby="personal-sounds-title">
    <div className="gesture-audio-heading"><div><p className="eyebrow">Local-only audio</p><h2 id="personal-sounds-title">Personal Sounds</h2></div><div className="personal-sound-actions"><label className="primary-button">Import Audio<input type="file" accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg" hidden onChange={(event) => { void importFile(event.target.files?.[0]); event.currentTarget.value = '' }} /></label><button className="secondary-button" type="button" onClick={() => setShowRecorder(true)}>Record Sound</button></div></div>
    <p className="gesture-audio-message">Import up to 10 seconds or 12 MB, or record up to 10 seconds through your microphone. Audio stays in this browser’s IndexedDB and is never uploaded.</p>
    {message && <p className="audio-error">{message}</p>}
    <dl className="effect-readout" aria-label="Personal sound diagnostics">
      <div><dt>Active source</dt><dd>{activeSource.type === 'personal-sample' ? 'Personal sample' : 'Built-in instrument'}</dd></div>
      <div><dt>Personal source</dt><dd>{activeSound?.sourceType === 'recorded' ? 'Microphone recording' : activeSound ? 'Imported audio' : '—'}</dd></div>
      <div><dt>Active sample ID</dt><dd>{activeSound?.id ?? '—'}</dd></div>
      <div><dt>Root MIDI note</dt><dd>{activeSound?.rootMidiNote ?? '—'}</dd></div>
      <div><dt>Active voices</dt><dd>{engine.getActiveVoiceCount()}</dd></div>
      <div><dt>Playback rates</dt><dd>{activePlaybackRates.length ? activePlaybackRates.map((rate) => rate.toFixed(2)).join(', ') : '—'}</dd></div>
      <div><dt>Sample voice groups</dt><dd>{sampleVoiceGroup.groupCount}</dd></div>
      <div><dt>Group member voices</dt><dd>{sampleVoiceGroup.memberVoiceCount || '—'}</dd></div>
      <div><dt>Natural voice durations</dt><dd>{sampleVoiceGroup.naturalVoiceDurations.length ? sampleVoiceGroup.naturalVoiceDurations.map((duration) => `${duration.toFixed(3)} s`).join(', ') : '—'}</dd></div>
      <div><dt>Shared chord duration</dt><dd>{sampleVoiceGroup.sharedDurationSeconds === null ? '—' : `${sampleVoiceGroup.sharedDurationSeconds.toFixed(3)} s`}</dd></div>
      <div><dt>Shared schedule</dt><dd>{sampleVoiceGroup.startTime === null ? '—' : `start ${sampleVoiceGroup.startTime.toFixed(3)} · release ${sampleVoiceGroup.releaseStartTime?.toFixed(3) ?? '—'} · stop ${sampleVoiceGroup.stopTime?.toFixed(3) ?? '—'}`}</dd></div>
      <div><dt>Trim region</dt><dd>{activeSound ? `${activeSound.trimStartSeconds.toFixed(2)}–${activeSound.trimEndSeconds.toFixed(2)} s` : '—'}</dd></div>
      <div><dt>Normalisation</dt><dd>{activeSound ? `${activeSound.normalisationGain.toFixed(2)}×` : '—'}</dd></div>
      <div><dt>Loop state</dt><dd>{activeSound?.loopEnabled ? 'On' : activeSound ? 'Off' : '—'}</dd></div>
      <div><dt>Loop region</dt><dd>{activeSound?.loopEnabled ? `${activeSound.loopStartSeconds.toFixed(2)}–${activeSound.loopEndSeconds.toFixed(2)} s` : '—'}</dd></div>
      <div><dt>Loop edge fade</dt><dd>{activeSound?.loopEnabled ? `${(activeSound.loopCrossfadeSeconds * 1000).toFixed(0)} ms` : '—'}</dd></div>
      <div><dt>Storage</dt><dd>{databaseStatus}</dd></div>
    </dl>
    {showRecorder && <RecordingPanel engine={engine} onUseRecording={useRecording} onCancel={() => setShowRecorder(false)} />}
    {editor && <SampleEditor buffer={editor.buffer} draft={editor.draft} engine={engine} message={message} onChange={(draft) => setEditor({ ...editor, draft })} onSave={() => void saveEditor()} onCancel={() => setEditor(null)} onStopPreview={() => engine.stop()} />}
    <div className="chord-buttons" aria-label="Saved personal sounds">
      {sounds.length === 0 ? <p>No personal sounds saved yet.</p> : sounds.map((sound) => <div key={sound.id}><button className="chord-button" type="button" aria-pressed={activeId === sound.id} onClick={() => void selectSound(sound)}>{sound.name}{sound.loopEnabled ? ' · Looping' : ''}</button><button className="secondary-button" type="button" onClick={() => void preview(sound)}>Preview</button><button className="secondary-button" type="button" onClick={() => void edit(sound)}>Edit</button><button className="secondary-button" type="button" onClick={() => void rename(sound)}>Rename</button><button className="secondary-button" type="button" onClick={() => void duplicate(sound)}>Duplicate</button><button className="secondary-button" type="button" onClick={() => void remove(sound)}>Delete</button></div>)}
    </div>
  </section>
}
