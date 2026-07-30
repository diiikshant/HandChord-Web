import { migrateSavedProject, normaliseProjectAudio, normaliseSavedLayer, normaliseSavedProject } from './projectModel.ts'
import { PROJECT_DATABASE_NAME, PROJECT_DATABASE_VERSION, PROJECT_SCHEMA_VERSION, type ProjectLibrarySummary, type ProjectSaveInput, type StorageEstimate, type StoredProjectBundle } from './projectTypes.ts'

export const PROJECT_STORES = { projects: 'projects', layers: 'projectLayers', audio: 'projectAudio' } as const

function requestResult<T>(request: IDBRequest<T>, error: string): Promise<T> {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error?.name === 'QuotaExceededError' ? new Error('Browser storage is full. Free space and try saving again.') : new Error(error)) })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onabort = () => reject(transaction.error?.name === 'QuotaExceededError' ? new Error('Browser storage is full. Free space and try saving again.') : new Error('The project save transaction was aborted.')); transaction.onerror = () => reject(new Error('The project database transaction failed.')) })
}

export function openProjectDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable in this browser.'))
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PROJECT_DATABASE_NAME, PROJECT_DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(PROJECT_STORES.projects)) database.createObjectStore(PROJECT_STORES.projects, { keyPath: 'id' })
      if (!database.objectStoreNames.contains(PROJECT_STORES.layers)) {
        const layers = database.createObjectStore(PROJECT_STORES.layers, { keyPath: 'id' })
        layers.createIndex('projectId', 'projectId', { unique: false })
      }
      if (!database.objectStoreNames.contains(PROJECT_STORES.audio)) {
        const audio = database.createObjectStore(PROJECT_STORES.audio, { keyPath: 'id' })
        audio.createIndex('projectId', 'projectId', { unique: false })
        audio.createIndex('layerId', 'layerId', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('Could not open the project database.'))
    request.onblocked = () => reject(new Error('The project database is blocked by another open page. Close other HandChord tabs and try again.'))
  })
}

async function recordsForProject<T>(store: IDBObjectStore, projectId: string): Promise<T[]> { return requestResult(store.index('projectId').getAll(projectId) as IDBRequest<T[]>, 'Could not read project records.') }

async function existingProjectRecords(database: IDBDatabase, projectId: string) {
  const transaction = database.transaction([PROJECT_STORES.layers, PROJECT_STORES.audio], 'readonly')
  const layers = recordsForProject<unknown>(transaction.objectStore(PROJECT_STORES.layers), projectId)
  const audio = recordsForProject<unknown>(transaction.objectStore(PROJECT_STORES.audio), projectId)
  const [layerRecords, audioRecords] = await Promise.all([layers, audio])
  await transactionDone(transaction)
  return { layerRecords, audioRecords }
}

/** Writes metadata and lossless PCM together. An aborted transaction keeps the prior ready project untouched. */
export async function saveProjectBundle(input: ProjectSaveInput) {
  const database = await openProjectDatabase()
  try {
    const previous = await existingProjectRecords(database, input.project.id)
    const transaction = database.transaction(Object.values(PROJECT_STORES), 'readwrite')
    const projects = transaction.objectStore(PROJECT_STORES.projects)
    const layers = transaction.objectStore(PROJECT_STORES.layers)
    const audio = transaction.objectStore(PROJECT_STORES.audio)
    input.audio.forEach((record) => audio.put(record))
    input.layers.forEach((record) => layers.put(record))
    projects.put(input.project)
    const nextLayerIds = new Set(input.layers.map((layer) => layer.id))
    const nextAudioIds = new Set(input.audio.map((record) => record.id))
    previous.layerRecords.map(normaliseSavedLayer).filter((layer): layer is NonNullable<typeof layer> => layer !== null).filter((layer) => !nextLayerIds.has(layer.id)).forEach((layer) => layers.delete(layer.id))
    previous.audioRecords.map(normaliseProjectAudio).filter((record): record is NonNullable<typeof record> => record !== null).filter((record) => !nextAudioIds.has(record.id)).forEach((record) => audio.delete(record.id))
    await transactionDone(transaction)
  } finally { database.close() }
}

export async function listProjects(): Promise<ProjectLibrarySummary[]> {
  const database = await openProjectDatabase()
  try {
    const transaction = database.transaction([PROJECT_STORES.projects, PROJECT_STORES.layers], 'readonly')
    const projectsRequest = requestResult(transaction.objectStore(PROJECT_STORES.projects).getAll(), 'Could not list saved projects.')
    const layersRequest = requestResult(transaction.objectStore(PROJECT_STORES.layers).getAll(), 'Could not list saved layers.')
    const [projects, layers] = await Promise.all([projectsRequest, layersRequest])
    await transactionDone(transaction)
    const counts = new Map<string, number>()
    layers.map(normaliseSavedLayer).filter((layer): layer is NonNullable<typeof layer> => layer !== null).forEach((layer) => counts.set(layer.projectId, (counts.get(layer.projectId) ?? 0) + 1))
    return projects.map(normaliseSavedProject).filter((project): project is NonNullable<typeof project> => project !== null).map((project) => ({ id: project.id, name: project.name, createdAt: project.createdAt, modifiedAt: project.modifiedAt, lastOpenedAt: project.lastOpenedAt, bpm: project.bpm, barCount: project.barCount, durationSeconds: project.durationSeconds, projectStatus: project.projectStatus, layerCount: counts.get(project.id) ?? 0 })).sort((a, b) => b.modifiedAt - a.modifiedAt)
  } finally { database.close() }
}

export async function loadProjectBundle(projectId: string): Promise<StoredProjectBundle> {
  const database = await openProjectDatabase()
  try {
    const transaction = database.transaction(Object.values(PROJECT_STORES), 'readonly')
    const projectRequest = requestResult(transaction.objectStore(PROJECT_STORES.projects).get(projectId), 'Could not load this project.')
    const layersRequest = recordsForProject<unknown>(transaction.objectStore(PROJECT_STORES.layers), projectId)
    const audioRequest = recordsForProject<unknown>(transaction.objectStore(PROJECT_STORES.audio), projectId)
    const [projectValue, layerValues, audioValues] = await Promise.all([projectRequest, layersRequest, audioRequest])
    if (projectValue && typeof projectValue === 'object' && Number.isFinite((projectValue as { schemaVersion?: unknown }).schemaVersion) && (projectValue as { schemaVersion: number }).schemaVersion > PROJECT_SCHEMA_VERSION) throw new Error('This project was saved by a newer HandChord version and cannot be opened safely.')
    const project = migrateSavedProject(projectValue)
    if (!project) throw new Error('This project has invalid or unsupported metadata and was left unchanged.')
    const layers = layerValues.map(normaliseSavedLayer).filter((layer): layer is NonNullable<typeof layer> => layer !== null).sort((a, b) => a.order - b.order)
    const byId = new Map(audioValues.map(normaliseProjectAudio).filter((audio): audio is NonNullable<typeof audio> => audio !== null).map((audio) => [audio.id, audio]))
    const missingAudioDataIds = layers.filter((layer) => !byId.has(layer.audioDataId)).map((layer) => layer.audioDataId)
    await transactionDone(transaction)
    return { project, layers, audio: byId, missingAudioDataIds }
  } finally { database.close() }
}

export async function renameStoredProject(projectId: string, name: string) {
  const database = await openProjectDatabase()
  try {
    const read = database.transaction(PROJECT_STORES.projects, 'readonly')
    const current = normaliseSavedProject(await requestResult(read.objectStore(PROJECT_STORES.projects).get(projectId), 'Could not read this project.'))
    await transactionDone(read)
    if (!current) throw new Error('This project is unavailable or corrupt.')
    const transaction = database.transaction(PROJECT_STORES.projects, 'readwrite')
    transaction.objectStore(PROJECT_STORES.projects).put({ ...current, name, modifiedAt: Date.now() })
    await transactionDone(transaction)
  } finally { database.close() }
}

export async function markProjectOpened(projectId: string, lastOpenedAt: number) {
  const database = await openProjectDatabase()
  try {
    const read = database.transaction(PROJECT_STORES.projects, 'readonly')
    const current = normaliseSavedProject(await requestResult(read.objectStore(PROJECT_STORES.projects).get(projectId), 'Could not read this project.'))
    await transactionDone(read)
    if (!current) throw new Error('This project is unavailable or corrupt.')
    const write = database.transaction(PROJECT_STORES.projects, 'readwrite')
    write.objectStore(PROJECT_STORES.projects).put({ ...current, lastOpenedAt })
    await transactionDone(write)
  } finally { database.close() }
}

export async function deleteStoredProject(projectId: string) {
  const database = await openProjectDatabase()
  try {
    const previous = await existingProjectRecords(database, projectId)
    const transaction = database.transaction(Object.values(PROJECT_STORES), 'readwrite')
    const layers = transaction.objectStore(PROJECT_STORES.layers); const audio = transaction.objectStore(PROJECT_STORES.audio)
    transaction.objectStore(PROJECT_STORES.projects).delete(projectId)
    previous.layerRecords.map(normaliseSavedLayer).filter((layer): layer is NonNullable<typeof layer> => layer !== null).forEach((layer) => layers.delete(layer.id))
    previous.audioRecords.map(normaliseProjectAudio).filter((record): record is NonNullable<typeof record> => record !== null).forEach((record) => audio.delete(record.id))
    await transactionDone(transaction)
  } finally { database.close() }
}

export async function storageEstimate(): Promise<StorageEstimate> {
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage
  if (!storage?.estimate) return { usage: null, quota: null, persistent: null }
  const [estimate, persistent] = await Promise.all([storage.estimate(), storage.persisted ? storage.persisted().catch(() => false) : Promise.resolve(null)])
  return { usage: estimate.usage ?? null, quota: estimate.quota ?? null, persistent }
}

export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) throw new Error('This browser does not support requesting persistent storage.')
  return navigator.storage.persist()
}
