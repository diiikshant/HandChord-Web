import { useEffect, useRef } from 'react'
import { useCamera } from './hooks/useCamera'
import './App.css'

const messages = {
  idle: 'Camera is not started. Nothing is being recorded.',
  requesting: 'Requesting camera permission…',
  active: 'Camera is active. Your preview is visible below.',
  denied: 'Camera permission was denied. Allow camera access in Chrome, then try again.',
  unavailable: 'No usable camera was found on this device.',
  error: 'The camera could not start. Please try again.',
}

function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const { startCamera, status, stopCamera, stream } = useCamera()
  const canTryAgain = status === 'denied' || status === 'unavailable' || status === 'error'

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  return (
    <main className="app-shell">
      <section className="camera-card" aria-labelledby="app-title">
        <p className="eyebrow">Desktop music sandbox</p>
        <h1 id="app-title">HandChord</h1>
        <p className="description">Create music using hand gestures</p>

        <div className="camera-stage">
          {status === 'active' ? (
            <video
              ref={videoRef}
              className="camera-preview"
              autoPlay
              muted
              playsInline
              aria-label="Live mirrored webcam preview"
            />
          ) : (
            <div className="camera-placeholder" aria-hidden="true">
              <span>Camera preview</span>
            </div>
          )}
        </div>

        <p className={`camera-status status-${status}`} aria-live="polite">
          {messages[status]}
        </p>

        <div className="camera-actions">
          {status !== 'active' && status !== 'requesting' && (
            <button className="primary-button" type="button" onClick={() => void startCamera()}>
              Start Camera
            </button>
          )}
          {status === 'requesting' && (
            <button className="primary-button" type="button" disabled>
              Requesting Camera…
            </button>
          )}
          {status === 'active' && (
            <button className="secondary-button" type="button" onClick={stopCamera}>
              Stop Camera
            </button>
          )}
          {canTryAgain && (
            <button className="primary-button" type="button" onClick={() => void startCamera()}>
              Try Again
            </button>
          )}
        </div>
      </section>
    </main>
  )
}

export default App
