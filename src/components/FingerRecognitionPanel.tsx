import { FINGER_NAMES, type StableHandRecognition } from '../gestures/fingerState'

type FingerRecognitionPanelProps = {
  recognitions: StableHandRecognition[]
}

function displayGesture(gesture: StableHandRecognition['stableGesture']) {
  return gesture ? gesture.replace('-', ' ') : '—'
}

export function FingerRecognitionPanel({ recognitions }: FingerRecognitionPanelProps) {
  if (recognitions.length === 0) {
    return <p className="recognition-empty">Hand temporarily missing — no finger state is available.</p>
  }

  return (
    <div className="finger-recognition-list">
      {recognitions.map((recognition, index) => (
        <section className="finger-recognition-card" key={`${recognition.role}-${index}`}>
          <h3>
            {recognition.role === 'unresolved' ? 'Hand identity unresolved' : `Anatomical ${recognition.role} hand`}
          </h3>
          <p className="recognition-confidence">
            Handedness confidence: {(recognition.identityConfidence * 100).toFixed(1)}%
          </p>
          <dl className="finger-state-grid">
            {FINGER_NAMES.map((finger) => (
              <div key={finger}>
                <dt>{finger}</dt>
                <dd>{recognition.fingers[finger]}</dd>
              </div>
            ))}
          </dl>
          <dl className="recognition-summary">
            <div><dt>Raw count</dt><dd>{recognition.rawExtendedCount ?? '—'}</dd></div>
            <div><dt>Canonical gesture</dt><dd>{displayGesture(recognition.canonicalGesture)}</dd></div>
            <div><dt>Candidate gesture</dt><dd>{recognition.candidateGesture ? `Hold… ${displayGesture(recognition.candidateGesture)}` : '—'}</dd></div>
            <div><dt>Stable gesture</dt><dd>{displayGesture(recognition.stableGesture)}</dd></div>
            <div><dt>Stable count</dt><dd>{recognition.stableCount ?? '—'}</dd></div>
            <div><dt>Validation</dt><dd>{recognition.validationReason || recognition.reason || 'confirmed'}</dd></div>
          </dl>
        </section>
      ))}
    </div>
  )
}
