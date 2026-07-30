import { useEffect, useState } from 'react'
import type { AudioEngine } from '../audio/AudioEngine.ts'
import { mapLeftHorizontalToDistortionWet, resolveDistortionWet } from '../audio/DistortionMapping.ts'
import type { MovementState } from './useMovementTracking.ts'

/** Connects the already-calibrated, user-visible left horizontal axis to audio. */
export function useDistortionControl(engine: AudioEngine, movement: MovementState) {
  const [enabled, setEnabled] = useState(false)
  const calibrated = movement.profile.leftHorizontal.isValid
  const rawValue = movement.left.horizontal
  const curvedValue = rawValue === null ? null : rawValue * rawValue
  const wet = resolveDistortionWet(enabled, calibrated, rawValue)

  useEffect(() => {
    // AudioEngine owns the long-lived graph; this only automates its existing gains.
    engine.setDistortionWet(wet)
  }, [engine, wet])

  const status = !enabled
    ? 'Distortion Control is off'
    : !calibrated
      ? 'Distortion calibration required'
      : movement.left.unavailable
        ? 'left-hand tracking unavailable'
        : 'Distortion Control is active'

  return {
    enabled,
    setEnabled,
    calibrated,
    rawValue,
    curvedValue,
    wet,
    mappedWet: rawValue === null ? null : mapLeftHorizontalToDistortionWet(rawValue),
    status,
    oversample: '2×',
    gainCompensation: 'Dry −25% at full wet; wet path ×80%',
  }
}
