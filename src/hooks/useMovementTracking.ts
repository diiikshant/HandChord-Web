import { useEffect, useRef, useState } from 'react'
import { CalibrationService, type CalibrationProfile } from '../movement/CalibrationService.ts'
import { applyDeadZone, mapAxis, smoothValue } from '../movement/MovementMath.ts'
import { getPalmPosition, type PalmPosition } from '../movement/PalmPositionTracker.ts'
import type { TrackedHand } from '../tracking/handTrackingTypes.ts'

export type HandMovement = {
  rawX: number | null; rawY: number | null; smoothedX: number | null; smoothedY: number | null
  horizontal: number | null; vertical: number | null; confidence: number | null; unavailable: boolean; reason: string | null
}
export type MovementState = { left: HandMovement; right: HandMovement; profile: CalibrationProfile; service: CalibrationService }

const EMPTY: HandMovement = { rawX: null, rawY: null, smoothedX: null, smoothedY: null, horizontal: null, vertical: null, confidence: null, unavailable: true, reason: 'hand missing' }
const RETENTION_MS = 500

function nextHand(previous: HandMovement, palm: PalmPosition | undefined, profile: CalibrationProfile, role: 'left' | 'right', now: number, lastSeen: number | null, missingReason?: string): HandMovement {
  if (!palm) {
    const retaining = lastSeen !== null && now - lastSeen <= RETENTION_MS && previous.smoothedX !== null
    return { ...previous, unavailable: !retaining, reason: retaining ? 'retaining last valid value' : (missingReason ?? `${role} hand temporarily unavailable`) }
  }
  const x = smoothValue(previous.smoothedX, palm.rawX)
  const y = smoothValue(previous.smoothedY, palm.rawY)
  const horizontalRange = profile[role === 'left' ? 'leftHorizontal' : 'rightHorizontal']
  const verticalRange = profile[role === 'left' ? 'leftVertical' : 'rightVertical']
  const horizontalRaw = horizontalRange.isValid ? mapAxis(x, horizontalRange.minimum, horizontalRange.maximum) : null
  const verticalRaw = verticalRange.isValid ? mapAxis(y, verticalRange.minimum, verticalRange.maximum) : null
  return {
    rawX: palm.rawX, rawY: palm.rawY, smoothedX: x, smoothedY: y,
    horizontal: horizontalRaw === null ? null : applyDeadZone(horizontalRaw, previous.horizontal),
    vertical: verticalRaw === null ? null : applyDeadZone(verticalRaw, previous.vertical),
    confidence: palm.confidence, unavailable: false,
    reason: !verticalRange.isValid ? `${role} vertical not calibrated` : !horizontalRange.isValid ? `${role} horizontal not calibrated` : null,
  }
}

/** Movement diagnostics only: this hook never sends values to AudioEngine. */
export function useMovementTracking(hands: TrackedHand[]) {
  const serviceRef = useRef<CalibrationService | null>(null)
  if (!serviceRef.current) serviceRef.current = new CalibrationService()
  const service = serviceRef.current
  const [profile, setProfile] = useState(service.getProfile())
  const [state, setState] = useState({ left: EMPTY, right: EMPTY })
  const lastSeen = useRef<{ left: number | null; right: number | null }>({ left: null, right: null })

  useEffect(() => service.subscribe(setProfile), [service])
  useEffect(() => {
    const now = performance.now()
    const results = hands.map(getPalmPosition)
    const palms = results.filter((item): item is PalmPosition => 'role' in item)
    const rejection = results.find((item): item is { reason: string } => 'reason' in item)?.reason
    const left = palms.find((palm) => palm.role === 'left')
    const right = palms.find((palm) => palm.role === 'right')
    if (left) lastSeen.current.left = now
    if (right) lastSeen.current.right = now
    setState((previous) => ({
      left: nextHand(previous.left, left, profile, 'left', now, lastSeen.current.left, rejection),
      right: nextHand(previous.right, right, profile, 'right', now, lastSeen.current.right, rejection),
    }))
  }, [hands, profile])

  return { ...state, profile, service }
}
