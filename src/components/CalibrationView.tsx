import { useEffect, useRef, useState } from 'react'
import type { MovementState } from '../hooks/useMovementTracking.ts'
import { median } from '../movement/MovementMath.ts'
import type { AxisName } from '../movement/CalibrationService.ts'

type Step = { axis: AxisName; role: 'left' | 'right'; coordinate: 'rawX' | 'rawY'; edge: 'minimum' | 'maximum'; label: string }
const STEPS: Step[] = [
  { axis: 'leftVertical', role: 'left', coordinate: 'rawY', edge: 'minimum', label: 'Left hand: comfortable lower position' },
  { axis: 'leftVertical', role: 'left', coordinate: 'rawY', edge: 'maximum', label: 'Left hand: comfortable upper position' },
  { axis: 'leftHorizontal', role: 'left', coordinate: 'rawX', edge: 'minimum', label: 'Left hand: comfortable visual-left position' },
  { axis: 'leftHorizontal', role: 'left', coordinate: 'rawX', edge: 'maximum', label: 'Left hand: comfortable visual-right position' },
  { axis: 'rightVertical', role: 'right', coordinate: 'rawY', edge: 'minimum', label: 'Right hand: comfortable lower position' },
  { axis: 'rightVertical', role: 'right', coordinate: 'rawY', edge: 'maximum', label: 'Right hand: comfortable upper position' },
  { axis: 'rightHorizontal', role: 'right', coordinate: 'rawX', edge: 'minimum', label: 'Right hand: comfortable visual-left position' },
  { axis: 'rightHorizontal', role: 'right', coordinate: 'rawX', edge: 'maximum', label: 'Right hand: comfortable visual-right position' },
]
const AXIS_LABELS: Record<AxisName, string> = { leftVertical: 'Reverb range', leftHorizontal: 'Distortion range', rightVertical: 'Volume range', rightHorizontal: 'Chorus range' }

export function CalibrationView({ movement }: { movement: MovementState }) {
  const [queue, setQueue] = useState<Step[]>([])
  const [capturing, setCapturing] = useState(false)
  const [message, setMessage] = useState('Choose Start Full Calibration or a recalibration action.')
  const pending = useRef<Partial<Record<AxisName, number>>>({})
  const samples = useRef<number[]>([])
  const startedAt = useRef<number | null>(null)
  const step = queue[0]

  const start = (steps: Step[]) => { setQueue(steps); setCapturing(false); pending.current = {}; setMessage(steps[0] ? `Ready: ${steps[0].label}` : 'Nothing to calibrate.') }
  const beginCapture = () => {
    if (!step) return
    const hand = movement[step.role]
    const sample = hand[step.coordinate]
    if (sample === null || hand.unavailable) { setMessage(hand.reason ?? `${step.role} hand missing`); return }
    if (hand.confidence === null || hand.confidence < 0.7) { setMessage('low landmark confidence'); return }
    samples.current = []; startedAt.current = performance.now(); setCapturing(true); setMessage(`Capturing ${step.label}… hold still for 700 ms.`)
  }

  useEffect(() => {
    if (!capturing || !step || startedAt.current === null) return
    const hand = movement[step.role]; const sample = hand[step.coordinate]
    if (sample === null || hand.unavailable) { setCapturing(false); setMessage(hand.reason ?? `${step.role} hand missing`); return }
    if (hand.confidence === null || hand.confidence < 0.7) { setCapturing(false); setMessage('low landmark confidence'); return }
    samples.current.push(sample)
    if (performance.now() - startedAt.current < 700) return
    const captured = median(samples.current)
    setCapturing(false)
    if (captured === null) { setMessage('No calibration samples were captured.'); return }
    const paired = pending.current[step.axis]
    if (paired === undefined) {
      pending.current[step.axis] = captured
      setQueue((current) => current.slice(1)); setMessage(`Captured. Next: ${queue[1]?.label ?? 'done'}`); return
    }
    const result = step.axis === 'leftVertical' ? movement.service.updateLeftVertical(paired, captured)
      : step.axis === 'leftHorizontal' ? movement.service.updateLeftHorizontal(paired, captured)
      : step.axis === 'rightVertical' ? movement.service.updateRightVertical(paired, captured)
      : movement.service.updateRightHorizontal(paired, captured)
    if (!result.ok) { setMessage(result.reason); return }
    delete pending.current[step.axis]; setQueue((current) => current.slice(1)); setMessage(queue[1] ? `Saved ${AXIS_LABELS[step.axis]}. Next: ${queue[1].label}` : `Saved ${AXIS_LABELS[step.axis]}. Calibration complete.`)
  }, [capturing, step, movement, queue])

  const ranges = Object.entries(movement.profile) as [AxisName, typeof movement.profile.leftVertical][]
  return <section className="calibration-panel" aria-labelledby="calibration-title">
    <h2 id="calibration-title">Movement calibration</h2><p>{message}</p>
    <div className="calibration-actions"><button className="primary-button" type="button" onClick={() => start(STEPS)}>Start Full Calibration</button>
      <button className="secondary-button" type="button" onClick={() => { movement.service.clear('leftVertical'); start(STEPS.slice(0, 2)) }}>Recalibrate Reverb range</button>
      <button className="secondary-button" type="button" onClick={() => { movement.service.clear('leftHorizontal'); start(STEPS.slice(2, 4)) }}>Recalibrate Distortion range</button>
      <button className="secondary-button" type="button" onClick={() => { movement.service.clear('rightVertical'); start(STEPS.slice(4, 6)) }}>Recalibrate Volume range</button>
      <button className="secondary-button" type="button" onClick={() => { movement.service.clear('rightHorizontal'); start(STEPS.slice(6, 8)) }}>Recalibrate Chorus range</button>
      <button className="secondary-button" type="button" onClick={() => { movement.service.clearLeftHand(); start(STEPS.slice(0, 4)) }}>Recalibrate Left Hand</button>
      <button className="secondary-button" type="button" onClick={() => { movement.service.clearRightHand(); start(STEPS.slice(4, 8)) }}>Recalibrate Right Hand</button>
      <button className="secondary-button" type="button" onClick={() => { movement.service.resetAll(); setQueue([]); setMessage('All calibration ranges were reset.') }}>Reset All Calibration</button></div>
    {step && <div className="calibration-step"><strong>Step: {step.label}</strong><button className="primary-button" type="button" disabled={capturing} onClick={beginCapture}>{capturing ? 'Capturing…' : 'Capture This Position'}</button></div>}
    <dl className="calibration-summary">{ranges.map(([axis, range]) => <div key={axis}><dt>{AXIS_LABELS[axis]}</dt><dd>{range.isValid ? `Ready (${range.minimum.toFixed(2)} → ${range.maximum.toFixed(2)})` : 'Missing'}</dd></div>)}</dl>
  </section>
}
