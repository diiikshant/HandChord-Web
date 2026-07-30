import { useEffect, useState } from 'react'
import type { AudioEngine } from '../audio/AudioEngine.ts'
import { combinedOutputGain, resolvePerformanceGain } from '../audio/PerformanceVolumeMapping.ts'
import type { MovementState } from './useMovementTracking.ts'

export function usePerformanceVolumeControl(engine: AudioEngine, movement: MovementState, manualMasterVolume: number) {
  const [enabled, setEnabled] = useState(false)
  const calibrated = movement.profile.rightVertical.isValid
  const rawValue = movement.right.vertical
  const gain = resolvePerformanceGain(enabled, calibrated, rawValue)
  useEffect(() => { engine.setPerformanceGain(gain) }, [engine, gain])
  const status = !enabled ? 'Performance Volume Control is off' : !calibrated ? 'Volume calibration required' : movement.right.unavailable ? 'right-hand tracking unavailable' : 'Performance Volume Control is active'
  return { enabled, setEnabled, calibrated, rawValue, gain, status, combined: combinedOutputGain(gain, manualMasterVolume) }
}
