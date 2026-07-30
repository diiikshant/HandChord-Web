import { DEFAULT_INSTRUMENT_ID, isInstrumentId } from './instrumentPresets.ts'
import type { InstrumentId } from './instrumentTypes.ts'

const STORAGE_KEY = 'handchord-active-instrument-v1'

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function browserStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null
  try { return window.localStorage } catch { return null }
}

export function loadInstrumentId(storage: StorageLike | null = browserStorage()): InstrumentId {
  const stored = storage?.getItem(STORAGE_KEY)
  return isInstrumentId(stored) ? stored : DEFAULT_INSTRUMENT_ID
}

export function saveInstrumentId(id: InstrumentId, storage: StorageLike | null = browserStorage()) {
  try { storage?.setItem(STORAGE_KEY, id) } catch { /* A disabled browser store should not block music playback. */ }
}
