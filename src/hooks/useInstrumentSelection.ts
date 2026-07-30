import { useCallback, useEffect, useState } from 'react'
import type { AudioEngine } from '../audio/AudioEngine.ts'
import { getInstrument } from '../audio/instruments/instrumentPresets.ts'
import { loadInstrumentId, saveInstrumentId } from '../audio/instruments/instrumentStorage.ts'
import type { InstrumentId } from '../audio/instruments/instrumentTypes.ts'

/** Stores the selected built-in instrument separately from camera and movement state. */
export function useInstrumentSelection(engine: AudioEngine) {
  const [instrumentId, setInstrumentId] = useState<InstrumentId>(() => loadInstrumentId())
  useEffect(() => {
    engine.setInstrument(instrumentId)
  }, [engine, instrumentId])
  const selectInstrument = useCallback((nextId: InstrumentId) => {
    saveInstrumentId(nextId)
    setInstrumentId(nextId)
  }, [])

  return { instrument: getInstrument(instrumentId), selectInstrument }
}
