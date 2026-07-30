import { createLoopSettings } from './sampleMath.ts'
import type { PersonalSound, PersonalSoundRecord } from './soundTypes.ts'

const DATABASE_NAME = 'handchord-personal-sounds'
const STORE_NAME = 'sounds'
const DATABASE_VERSION = 3

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable in this browser.'))
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
      // Version 3 keeps the same store and lazily normalises older loop/import
      // records when read, so existing local sounds remain usable.
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('Could not open the personal-sounds database.'))
  })
}

export function normalisePersonalSoundRecord(value: unknown): PersonalSoundRecord | null {
  if (!value || typeof value !== 'object') return null
  const sound = value as Partial<PersonalSoundRecord> & { loop?: unknown; loopEnabled?: unknown; loopStartSeconds?: unknown; loopEndSeconds?: unknown; loopCrossfadeSeconds?: unknown }
  if (typeof sound.id !== 'string' || typeof sound.name !== 'string' || (sound.sourceType !== 'personal-sample' && sound.sourceType !== 'recorded')
    || (sound.mode !== 'instrument' && sound.mode !== 'one-shot') || !(sound.audioData instanceof ArrayBuffer)
    || !Number.isFinite(sound.rootMidiNote) || !Number.isFinite(sound.trimStartSeconds) || !Number.isFinite(sound.trimEndSeconds)
    || !Number.isFinite(sound.fadeInSeconds) || !Number.isFinite(sound.fadeOutSeconds) || !Number.isFinite(sound.normalisationGain)
    || typeof sound.reverse !== 'boolean') return null

  const trimStart = sound.trimStartSeconds as number
  const trimEnd = sound.trimEndSeconds as number
  const originalMimeType = typeof sound.originalMimeType === 'string' ? sound.originalMimeType : null
  const recordingDurationSeconds = Number.isFinite(sound.recordingDurationSeconds) ? sound.recordingDurationSeconds as number : null
  const requestedStart = typeof sound.loopStartSeconds === 'number' ? sound.loopStartSeconds : trimStart
  const requestedEnd = typeof sound.loopEndSeconds === 'number' ? sound.loopEndSeconds : trimEnd
  const requestedCrossfade = typeof sound.loopCrossfadeSeconds === 'number' ? sound.loopCrossfadeSeconds : undefined
  const requestedLoop = (sound.loopEnabled === true || (sound.loopEnabled === undefined && sound.loop === true))
    && requestedStart === trimStart && requestedEnd === trimEnd
  const loop = createLoopSettings(sound.mode, requestedLoop, trimStart, trimEnd, requestedCrossfade)
  return { ...sound, originalMimeType, recordingDurationSeconds, ...loop } as PersonalSoundRecord
}

export function isPersonalSoundRecord(value: unknown): value is PersonalSoundRecord {
  return normalisePersonalSoundRecord(value) !== null
}

export async function savePersonalSound(record: PersonalSoundRecord) {
  const normalised = normalisePersonalSoundRecord(record)
  if (!normalised) throw new Error('This personal sound has invalid stored data.')
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(normalised)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(new Error('Could not save this personal sound.'))
  })
  database.close()
}

export async function listPersonalSounds(): Promise<PersonalSound[]> {
  const database = await openDatabase()
  const records = await new Promise<unknown[]>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('Could not load personal sounds.'))
  })
  database.close()
  return records.map(normalisePersonalSoundRecord).filter((record): record is PersonalSoundRecord => record !== null).map(({ audioData: _audioData, ...sound }) => sound)
}

export async function getPersonalSound(id: string): Promise<PersonalSoundRecord | null> {
  const database = await openDatabase()
  const record = await new Promise<unknown>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('Could not read this personal sound.'))
  })
  database.close()
  return normalisePersonalSoundRecord(record)
}

export async function deletePersonalSound(id: string) {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(new Error('Could not delete this personal sound.'))
  })
  database.close()
}
