import { useEffect, useState } from 'react'
import type { AudioEngine } from '../audio/AudioEngine.ts'
import { mapRightHorizontalToChorusWet, resolveChorusWet, reverseRightHorizontalForChorus } from '../audio/ChorusMapping.ts'
import type { MovementState } from './useMovementTracking.ts'

/** Connects the existing mirrored, calibrated right horizontal value to chorus. */
export function useChorusControl(engine: AudioEngine, movement: MovementState) {
  const [enabled, setEnabled] = useState(false)
  const calibrated = movement.profile.rightHorizontal.isValid
  const rawValue = movement.right.horizontal
  const curvedValue = rawValue === null ? null : reverseRightHorizontalForChorus(rawValue) ** 2
  const wet = resolveChorusWet(enabled, calibrated, rawValue)

  useEffect(() => {
    // The AudioEngine owns one chorus graph; this only automates its wet/dry gains.
    engine.setChorusWet(wet)
  }, [engine, wet])

  const status = !enabled
    ? 'Chorus Control is off'
    : !calibrated
      ? 'Chorus calibration required'
      : movement.right.unavailable
        ? 'right-hand tracking unavailable'
        : 'Chorus Control is active'

  return {
    enabled,
    setEnabled,
    calibrated,
    rawValue,
    curvedValue,
    wet,
    mappedWet: rawValue === null ? null : mapRightHorizontalToChorusWet(rawValue),
    status,
    baseDelay: '18 ms',
    modulationDepth: '2.5 ms',
    modulationRates: 'Left 0.25 Hz · Right 0.33 Hz',
    gainCompensation: 'Dry −20% at full wet; wet path ×70%',
    graphActive: engine.hasChorusGraph() ? 'Active' : 'Waiting for Enable Audio',
  }
}
