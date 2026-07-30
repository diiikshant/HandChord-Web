import { useState } from 'react'
import type { AudioEngine, AudioSnapshot } from '../audio/AudioEngine.ts'
import { CHROMATIC_NOTES, generateDiatonicTriad, type DiatonicChord, type RootKey, type ScaleName } from '../music/MusicTheoryEngine.ts'

type AudioTestProps = {
  engine: AudioEngine
  audio: AudioSnapshot
  root: RootKey
  scale: ScaleName
  onRootChange: (root: RootKey) => void
  onScaleChange: (scale: ScaleName) => void
  onManualAudioAction: () => void
  onMasterVolumeChange: (volume: number) => void
}

const STATUS_COPY = {
  disabled: 'Audio is disabled. Select Enable Audio before using the chord buttons.',
  starting: 'Starting the browser audio system…',
  ready: 'Audio is ready.',
  suspended: 'Audio is suspended. Select Resume Audio to continue.',
  error: 'Audio could not start. Check the message below and try again.',
}

function AudioTest({
  engine,
  audio,
  root,
  scale,
  onRootChange,
  onScaleChange,
  onManualAudioAction,
  onMasterVolumeChange,
}: AudioTestProps) {
  const [volume, setVolume] = useState(0.3)
  const [currentChord, setCurrentChord] = useState<DiatonicChord | null>(null)

  const stopForConfigurationChange = () => {
    engine.stop()
    onManualAudioAction()
    setCurrentChord(null)
  }

  const setKey = (key: RootKey) => {
    stopForConfigurationChange()
    onRootChange(key)
  }

  const setSelectedScale = (nextScale: ScaleName) => {
    stopForConfigurationChange()
    onScaleChange(nextScale)
  }

  const enableAudio = async () => {
    try {
      await engine.enable()
    } catch {
      // AudioEngine publishes a beginner-friendly error message for the panel.
    }
  }

  const resumeAudio = async () => {
    try {
      await engine.resume()
    } catch {
      // AudioEngine publishes a beginner-friendly error message for the panel.
    }
  }

  const playChord = (degree: number) => {
    const chord = generateDiatonicTriad(root, scale, degree)
    onManualAudioAction()
    try {
      const played = engine.playChord(`button-${root}-${scale}-${degree}`, chord.midiNotes)
      if (played) {
        setCurrentChord(chord)
      }
    } catch {
      // AudioEngine changes its state and error message rather than failing silently.
    }
  }

  const stopChord = () => {
    engine.stop()
    onManualAudioAction()
    setCurrentChord(null)
  }

  const playTestTone = () => {
    onManualAudioAction()
    try {
      engine.playTestTone()
      setCurrentChord(null)
    } catch {
      // AudioEngine changes its state and error message rather than failing silently.
    }
  }

  const changeVolume = (nextVolume: number) => {
    setVolume(nextVolume)
    engine.setMasterVolume(nextVolume)
    onMasterVolumeChange(nextVolume)
  }

  const chordButtons = [1, 2, 3, 4, 5, 6].map((degree) => generateDiatonicTriad(root, scale, degree))
  const canPlay = audio.status === 'ready'

  return (
    <section className="audio-test" aria-labelledby="audio-test-title">
      <div className="audio-test-heading">
        <div>
          <p className="eyebrow">Standalone sound check</p>
          <h2 id="audio-test-title">Audio Test</h2>
          <p>These buttons remain available alongside Gesture Audio for debugging.</p>
        </div>
        <span className={`audio-status audio-${audio.status}`}>Audio: {audio.status}</span>
      </div>

      <p className="audio-message" aria-live="polite">{STATUS_COPY[audio.status]}</p>
      {audio.error && <p className="audio-error">{audio.error}</p>}

      <div className="audio-actions">
        {audio.status === 'disabled' || audio.status === 'error' ? (
          <button className="primary-button" type="button" onClick={() => void enableAudio()}>
            Enable Audio
          </button>
        ) : null}
        {audio.status === 'suspended' ? (
          <button className="primary-button" type="button" onClick={() => void resumeAudio()}>
            Resume Audio
          </button>
        ) : null}
        <button className="secondary-button" type="button" onClick={playTestTone} disabled={!canPlay}>
          Play Test Tone (A4)
        </button>
      </div>

      <div className="audio-controls">
        <label>
          Root key
          <select value={root} onChange={(event) => setKey(event.target.value as RootKey)}>
            {CHROMATIC_NOTES.map((note) => <option key={note} value={note}>{note}</option>)}
          </select>
        </label>
        <label>
          Scale
          <select value={scale} onChange={(event) => setSelectedScale(event.target.value as ScaleName)}>
            <option value="major">Major</option>
            <option value="natural-minor">Natural Minor</option>
          </select>
        </label>
        <label>
          Master volume: {Math.round(volume * 100)}%
          <input
            type="range"
            min="0"
            max="0.8"
            step="0.01"
            value={volume}
            onChange={(event) => changeVolume(Number(event.target.value))}
          />
        </label>
      </div>

      <div className="chord-buttons" aria-label="Chord test buttons">
        {chordButtons.map((chord) => (
          <button
            key={chord.degree}
            className="chord-button"
            type="button"
            disabled={!canPlay}
            onClick={() => playChord(chord.degree)}
          >
            {chord.function}
          </button>
        ))}
        <button className="chord-button stop-button" type="button" disabled={!canPlay} onClick={stopChord}>Stop</button>
      </div>

      <dl className="audio-readout">
        <div><dt>Current key</dt><dd>{root}</dd></div>
        <div><dt>Current scale</dt><dd>{scale === 'major' ? 'Major' : 'Natural Minor'}</dd></div>
        <div><dt>Current chord function</dt><dd>{currentChord?.function ?? 'None'}</dd></div>
        <div><dt>Current chord name</dt><dd>{currentChord?.name ?? 'None'}</dd></div>
        <div><dt>Note names</dt><dd>{currentChord?.noteNames.join(', ') ?? 'None'}</dd></div>
        <div><dt>MIDI note numbers</dt><dd>{currentChord?.midiNotes.join(', ') ?? 'None'}</dd></div>
        <div><dt>AudioContext state</dt><dd>{audio.contextState}</dd></div>
      </dl>
    </section>
  )
}

export { AudioTest }
