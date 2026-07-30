import { useState } from 'react'
import type { CanonicalGesture, StableHandRecognition } from '../gestures/fingerState'

const STEPS: Array<{ gesture: CanonicalGesture; title: string; expected: string }> = [
  { gesture: 'fist', title: '1. Fist', expected: 'All five fingers folded (count 0)' },
  { gesture: 'one', title: '2. Index', expected: 'Index extended only (count 1)' },
  { gesture: 'two', title: '3. Index + middle', expected: 'Index and middle extended (count 2)' },
  { gesture: 'three', title: '4. Index + middle + ring', expected: 'Three long fingers extended (count 3)' },
  { gesture: 'four', title: '5. Four long fingers', expected: 'Thumb folded; four long fingers extended (count 4)' },
  { gesture: 'open-palm', title: '6. Open palm', expected: 'All five fingers extended (count 5)' },
]

type GestureDiagnosticsProps = {
  recognitions: StableHandRecognition[]
}

export function GestureDiagnostics({ recognitions }: GestureDiagnosticsProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const step = STEPS[stepIndex]
  const recognition = recognitions.find((item) => item.role !== 'unresolved') || recognitions[0]
  const stableDuration = recognition?.stableSince === null || recognition?.stableSince === undefined
    ? 0
    : performance.now() - recognition.stableSince
  const passed = recognition?.stableGesture === step.gesture && stableDuration >= 1000
  const detected = recognition?.stableGesture || recognition?.candidateGesture || recognition?.canonicalGesture || 'none'
  const failureReason = recognition?.validationReason || recognition?.reason || 'hand temporarily missing'

  return (
    <section className="gesture-diagnostics" aria-label="Gesture Diagnostics">
      <button className="secondary-button" type="button" onClick={() => setIsOpen((open) => !open)}>
        {isOpen ? 'Close Gesture Diagnostics' : 'Open Gesture Diagnostics'}
      </button>
      {isOpen && (
        <div className="gesture-diagnostics-content">
          <div>
            <p className="eyebrow">Gesture Diagnostics</p>
            <h3>{step.title}</h3>
            <p>Expected: {step.expected}</p>
            <p>Detected: {detected.replace('-', ' ')}</p>
            <p>
              {passed
                ? 'Pass — pose remained stable for one second.'
                : `Fail — ${failureReason}. Hold the expected pose steadily for one second.`}
            </p>
          </div>
          <div className="gesture-diagnostic-actions">
            <button
              className="secondary-button"
              type="button"
              disabled={stepIndex === 0}
              onClick={() => setStepIndex((index) => Math.max(0, index - 1))}
            >
              Previous
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={stepIndex === STEPS.length - 1}
              onClick={() => setStepIndex((index) => Math.min(STEPS.length - 1, index + 1))}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
