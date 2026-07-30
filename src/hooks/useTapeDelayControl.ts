import { useEffect, useMemo, useState } from 'react'
import type { AudioEngine } from '../audio/AudioEngine.ts'
import { resolveTapeDelayParameters } from '../audio/TapeDelayMapping.ts'
import type { MovementState } from './useMovementTracking.ts'

/** Connects only the existing calibrated right vertical axis to the tape-delay mix. */
export function useTapeDelayControl(engine: AudioEngine, movement: MovementState) {
  const [enabled, setEnabled] = useState(false)
  const calibrated = movement.profile.rightVertical.isValid
  const rawValue = movement.right.vertical
  const parameters = useMemo(
    () => resolveTapeDelayParameters(enabled, calibrated, rawValue),
    [enabled, calibrated, rawValue],
  )

  useEffect(() => {
    // The graph belongs to AudioEngine; movement only automates its existing parameters.
    engine.setTapeDelayParameters(parameters)
  }, [engine, parameters])

  const status = !enabled
    ? 'Tape Delay Control is off'
    : !calibrated
      ? 'Tape Delay calibration required'
      : movement.right.unavailable
        ? 'right-hand tracking unavailable'
        : 'Tape Delay Control is active'

  return { enabled, setEnabled, calibrated, rawValue, parameters, status, graphActive: engine.hasTapeDelayGraph() ? 'Active' : 'Waiting for Enable Audio' }
}
