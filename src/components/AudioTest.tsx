import { useEffect, useRef, useState } from 'react'
import { AudioEngine, type AudioSnapshot } from '../audio/AudioEngine.ts'
import { CHROMATIC_NOTES, generateDiatonicTriad, type DiatonicChord, type RootKey, type ScaleName } from '../music/MusicTheoryEngine.ts'

const INITIAL_AUDIO: AudioSnapshot = {
  status: 'disabled',
  contextState: 'not-created',
  activeChordId: null,
  error: null,
}

const STATUS_COPY = {
  disabled: 'Audio is disabled. Select Enable Audio before using the chord buttons.',
  starting: 'Starting the browser audio system…',
  ready: 'Audio is ready.',
  suspended: 'Audio is suspended. Select Resume Audio to continue.',
  error: 'Audio could not start. Check the message below and try again.',
}

function AudioTest() {
  const engineRef = useRef<AudioEngine | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)
  const [audio, setAudio] = useState<AudioSnapshot>(INITIAL_AUDIO)
  const [root, setRoot] = useState<RootKey>('C')
  const [scale, setScale] = useState<ScaleName>('major')
  const [volume, setVolume] = useState(0.3)
  const [currentChord, setCurrentChord] = useState<DiatonicChord | null>(null)

  const getEngine = () => {
    if (!engineRef.current) {
      const engine = new AudioEngine()
      unsubscribeRef.current = engine.subscribe(setAudio)
      engineRef.current = engine
    }
    return engineRef.current
  }

  const stopForConfigurationChange = () => {
    engineRef.current?.stop()
    setCurrentChord(null)
  }

  const setKey = (key: RootKey) => {
    stopForConfigurationChange()
    setRoot(key)
  }

  const setSelectedScale = (nextScale: ScaleName) => {
    stopForConfigurationChange()
    setScale(nextScale)
  }

  const enableAudio = async () => {
    try {
      await getEngine().enable()
    } catch {
      // AudioEngine publishes a beginner-friendly error message for the panel.
    }
  }

  const resumeAudio = async () => {
    try {
      await getEngine().resume()
    } catch {
      // AudioEngine publishes a beginner-friendly error message for the panel.
    }
  }

  const playChord = (degree: number) => {
    const chord = generateDiatonicTriad(root, scale, degree)
    try {
      const played = getEngine().playChord(`${root}-${scale}-${degree}`, chord.midiNotes)
      if (played) {
        setCurrentChord(chord)
      }
    } catch {
      // AudioEngine changes its state and error message rather than failing silently.
    }
  }

  const stopChord = () => {
    engineRef.current?.stop()
    setCurrentChord(null)
  }

  const playTestTone = () => {
    try {
      getEngine().playTestTone()
      setCurrentChord(null)
    } catch {
      // AudioEngine changes its state and error message rather than failing silently.
    }
  }

  const changeVolume = (nextVolume: number) => {
    setVolume(nextVolume)
    engineRef.current?.setMasterVolume(nextVolume)
  }

  useEffect(() => {
    const releaseOnHiddenPage = () => {
      if (document.hidden) {
        engineRef.current?.stop()
        setCurrentChord(null)
      }
    }
    document.addEventListener('visibilitychange', releaseOnHiddenPage)
    return () => {
      document.removeEventListener('visibilitychange', releaseOnHiddenPage)
      unsubscribeRef.current?.()
      engineRef.current?.dispose()
      engineRef.current = null
    }
  }, [])

  const chordButtons = [1, 2, 3, 4, 5, 6].map((degree) => generateDiatonicTriad(root, scale, degree))
  const canPlay = audio.status === 'ready'

  return (
    <section className="audio-test" aria-labelledby="audio-test-title">
      <div className="audio-test-heading">
        <div>
          <p className="eyebrow">Standalone sound check</p>
          <h2 id="audio-test-title">Audio Test</h2>
          <p>These buttons are separate from hand gestures for now.</p>
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
