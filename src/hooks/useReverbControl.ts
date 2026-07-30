import { useEffect, useState } from 'react'
import type { AudioEngine } from '../audio/AudioEngine.ts'
import { mapLeftVerticalToWet, resolveReverbWet } from '../audio/ReverbMapping.ts'
import type { MovementState } from './useMovementTracking.ts'

export function useReverbControl(engine: AudioEngine, movement: MovementState) {
  const [enabled, setEnabled] = useState(false)
  const calibrated = movement.profile.leftVertical.isValid
  const rawValue = movement.left.vertical
  const curvedValue = rawValue === null ? null : rawValue * rawValue
  const wet = resolveReverbWet(enabled, calibrated, rawValue)

  useEffect(() => {
    // AudioEngine owns the already-built graph; this only schedules a smooth gain change.
    engine.setReverbWet(wet)
  }, [engine, wet])

  const status = !enabled ? 'Reverb Control is off' : !calibrated ? 'Reverb calibration required' : movement.left.unavailable ? 'left-hand tracking unavailable' : 'Reverb Control is active'
  return { enabled, setEnabled, calibrated, rawValue, curvedValue, wet, status, decaySeconds: 6, mappedWet: rawValue === null ? null : mapLeftVerticalToWet(rawValue) }
}
