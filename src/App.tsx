import { useCallback, useEffect, useRef, useState } from 'react'
import { HandOverlay } from './components/HandOverlay'
import { AudioTest } from './components/AudioTest'
import { FingerRecognitionPanel } from './components/FingerRecognitionPanel'
import { GestureDiagnostics } from './components/GestureDiagnostics'
import { MovementDiagnostics } from './components/MovementDiagnostics'
import { CalibrationView } from './components/CalibrationView'
import { ReverbControl } from './components/ReverbControl'
import { DistortionControl } from './components/DistortionControl'
import { ChorusControl } from './components/ChorusControl'
import { TapeDelayControl } from './components/TapeDelayControl'
import { InstrumentSelector } from './components/InstrumentSelector'
import { useCamera } from './hooks/useCamera'
import { useFingerRecognition } from './hooks/useFingerRecognition'
import { useHandTracking } from './hooks/useHandTracking'
import { useAudioEngine } from './hooks/useAudioEngine'
import { useGestureAudio } from './hooks/useGestureAudio'
import { useMovementTracking } from './hooks/useMovementTracking'
import { useReverbControl } from './hooks/useReverbControl'
import { useDistortionControl } from './hooks/useDistortionControl'
import { useChorusControl } from './hooks/useChorusControl'
import { useTapeDelayControl } from './hooks/useTapeDelayControl'
import { useInstrumentSelection } from './hooks/useInstrumentSelection'
import type { InstrumentId } from './audio/instruments/instrumentTypes'
import type { RootKey, ScaleName } from './music/MusicTheoryEngine'
import type { CanvasDimensions } from './tracking/handTrackingTypes'
import './App.css'

const cameraMessages = {
  idle: 'Camera is not started. Nothing is being recorded.',
  requesting: 'Requesting camera permission…',
  active: 'Camera is active. Hand tracking starts when the model is ready.',
  denied: 'Camera permission was denied. Allow camera access in Chrome, then try again.',
  unavailable: 'No usable camera was found on this device.',
  error: 'The camera could not start. Please try again.',
}

function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [root, setRoot] = useState<RootKey>('C')
  const [scale, setScale] = useState<ScaleName>('major')
  const [manualMasterVolume, setManualMasterVolume] = useState(1)
  const { startCamera, status: cameraStatus, stopCamera, stream } = useCamera(videoRef)
  const { hands, inferenceFps, modelStatus, trackingStatus, videoDimensions } = useHandTracking(
    videoRef,
    stream,
    cameraStatus === 'active',
  )
  const recognitions = useFingerRecognition(hands)
  const movement = useMovementTracking(hands)
  const { engine, audio } = useAudioEngine()
  const reverb = useReverbControl(engine, movement)
  const distortion = useDistortionControl(engine, movement)
  const chorus = useChorusControl(engine, movement)
  const tapeDelay = useTapeDelayControl(engine, movement)
  const { instrument, selectInstrument: selectStoredInstrument } = useInstrumentSelection(engine)
  const {
    gestureAudio,
    setGestureAudioEnabled,
    releaseGestureAudioOwnership,
  } = useGestureAudio({ engine, recognitions, liveHandCount: hands.length, root, scale })
  const [canvasDimensions, setCanvasDimensions] = useState<CanvasDimensions>({
    width: 0,
    height: 0,
    pixelRatio: 1,
  })
  const canTryAgain =
    cameraStatus === 'denied' || cameraStatus === 'unavailable' || cameraStatus === 'error'

  const selectInstrument = useCallback((id: InstrumentId) => {
    if (id === instrument.id) return
    // A new preset should begin with fresh voices rather than leaving the old chord running.
    releaseGestureAudioOwnership()
    selectStoredInstrument(id)
  }, [instrument.id, releaseGestureAudioOwnership, selectStoredInstrument])

  const updateCanvasDimensions = useCallback((dimensions: CanvasDimensions) => {
    setCanvasDimensions((current) =>
      current.width === dimensions.width &&
      current.height === dimensions.height &&
      current.pixelRatio === dimensions.pixelRatio
        ? current
        : dimensions,
    )
  }, [])

  useEffect(() => {
    const releaseAudioWhenHidden = () => {
      if (document.hidden) {
        engine.stop()
        releaseGestureAudioOwnership()
      }
    }
    document.addEventListener('visibilitychange', releaseAudioWhenHidden)
    return () => document.removeEventListener('visibilitychange', releaseAudioWhenHidden)
  }, [engine, releaseGestureAudioOwnership])

  return (
    <main className="app-shell">
      <section className="camera-card" aria-labelledby="app-title">
        <div className="heading-row">
          <div>
            <p className="eyebrow">Desktop music sandbox</p>
            <h1 id="app-title">HandChord</h1>
            <p className="description">Create music using hand gestures</p>
          </div>
          <p className={`model-badge model-${modelStatus}`}>Model: {modelStatus}</p>
        </div>

        <div className="camera-stage">
          <video
            ref={videoRef}
            className="camera-preview"
            muted
            playsInline
            hidden={
              cameraStatus === 'idle' ||
              cameraStatus === 'denied' ||
              cameraStatus === 'unavailable' ||
              cameraStatus === 'error'
            }
            aria-label="Live mirrored webcam preview"
          />
          <HandOverlay
            hands={hands}
            videoRef={videoRef}
            onCanvasDimensionsChange={updateCanvasDimensions}
          />
          {cameraStatus !== 'active' && (
            <div className="camera-placeholder" aria-hidden="true">
              <span>Camera preview</span>
            </div>
          )}
        </div>

        <p className={`camera-status status-${cameraStatus}`} aria-live="polite">
          {cameraMessages[cameraStatus]}
        </p>

        <div className="camera-actions">
          {cameraStatus !== 'active' && cameraStatus !== 'requesting' && (
            <button className="primary-button" type="button" onClick={() => void startCamera()}>
              Start Camera
            </button>
          )}
          {cameraStatus === 'requesting' && (
            <button className="primary-button" type="button" disabled>
              Requesting Camera…
            </button>
          )}
          {cameraStatus === 'active' && (
            <button className="secondary-button" type="button" onClick={() => stopCamera()}>
              Stop Camera
            </button>
          )}
          {canTryAgain && (
            <button className="primary-button" type="button" onClick={() => void startCamera()}>
              Try Again
            </button>
          )}
        </div>

        <section className="gesture-audio-panel" aria-labelledby="gesture-audio-title">
          <div className="gesture-audio-heading">
            <div>
              <p className="eyebrow">Live camera control</p>
              <h2 id="gesture-audio-title">Gesture Audio</h2>
            </div>
            <label className="gesture-audio-toggle">
              <input
                type="checkbox"
                checked={gestureAudio.enabled}
                onChange={(event) => setGestureAudioEnabled(event.target.checked)}
              />
              Enable Gesture Audio
            </label>
          </div>
          <p className="gesture-audio-message" aria-live="polite">
            {gestureAudio.enabled ? (gestureAudio.reason ?? 'Waiting for a stable two-hand chord selection.') : 'Gesture Audio is off. Camera tracking remains active.'}
          </p>
          <dl className="gesture-audio-readout">
            <div><dt>Gesture state</dt><dd>{gestureAudio.state === 'hold' ? 'Hold…' : gestureAudio.state.replaceAll('-', ' ')}</dd></div>
            <div><dt>Left stable gesture</dt><dd>{gestureAudio.leftGesture ?? 'Waiting'}</dd></div>
            <div><dt>Right stable gesture</dt><dd>{gestureAudio.rightGesture ?? 'Waiting'}</dd></div>
            <div><dt>Current chord bank</dt><dd>{gestureAudio.bank ?? 'Waiting'}</dd></div>
            <div><dt>Current chord function</dt><dd>{gestureAudio.chord?.function ?? 'None'}</dd></div>
            <div><dt>Current chord name</dt><dd>{gestureAudio.chord?.name ?? 'None'}</dd></div>
            <div><dt>Current notes</dt><dd>{gestureAudio.chord?.noteNames.join(', ') ?? 'None'}</dd></div>
          </dl>
        </section>

        <MovementDiagnostics movement={movement} />
        <CalibrationView movement={movement} />
        <ReverbControl reverb={reverb} />
        <DistortionControl distortion={distortion} />
        <ChorusControl chorus={chorus} />
        <TapeDelayControl tapeDelay={tapeDelay} manualMasterVolume={manualMasterVolume} />
        <InstrumentSelector instrument={instrument} activeVoiceCount={engine.getActiveVoiceCount()} onSelect={selectInstrument} title="Camera performance instrument" />

        <aside className="debug-panel" aria-label="Hand tracking diagnostics">
          <div className="debug-heading">
            <span>Tracking diagnostics</span>
            <span className={`tracking-status tracking-${trackingStatus}`}>{trackingStatus}</span>
          </div>
          <dl>
            <div>
              <dt>Detected hands</dt>
              <dd>{hands.length}</dd>
            </div>
            <div>
              <dt>Inference FPS</dt>
              <dd>{inferenceFps}</dd>
            </div>
            <div>
              <dt>Video dimensions</dt>
              <dd>{videoDimensions.width} × {videoDimensions.height}</dd>
            </div>
            <div>
              <dt>Canvas dimensions</dt>
              <dd>{canvasDimensions.width} × {canvasDimensions.height} @ {canvasDimensions.pixelRatio}×</dd>
            </div>
            <div>
              <dt>Model status</dt>
              <dd>{modelStatus}</dd>
            </div>
            {hands.map((hand, index) => (
              <div key={`${hand.handedness}-${index}`}>
                <dt>Hand {index + 1}</dt>
                <dd>{hand.handedness} · {(hand.confidence * 100).toFixed(1)}%</dd>
              </div>
            ))}
          </dl>
          <FingerRecognitionPanel recognitions={recognitions} />
          <GestureDiagnostics recognitions={recognitions} />
        </aside>

        <AudioTest
          engine={engine}
          audio={audio}
          root={root}
          scale={scale}
          onRootChange={setRoot}
          onScaleChange={setScale}
          onManualAudioAction={releaseGestureAudioOwnership}
          onMasterVolumeChange={setManualMasterVolume}
          instrument={instrument}
          activeVoiceCount={engine.getActiveVoiceCount()}
          onInstrumentChange={selectInstrument}
        />
      </section>
    </main>
  )
}

export default App
