import type { AudioEngine } from '../audio/AudioEngine.ts'
import type { CompositionSession } from '../composition/compositionTypes.ts'
import type { CompositionTransport } from '../composition/CompositionTransport.ts'
import { createLayerAudioRecord, createProjectId, createSavedLayer, defaultProjectName, preferencesFromProject, validateProjectName } from './projectModel.ts'
import { deleteStoredProject, listProjects, loadProjectBundle, markProjectOpened, renameStoredProject, requestPersistentStorage, saveProjectBundle, storageEstimate, PROJECT_STORES } from './projectStorage.ts'
import { PROJECT_ARCHITECTURE_VERSION, PROJECT_DATABASE_VERSION, PROJECT_SCHEMA_VERSION, type ProjectLibrarySummary, type ProjectPreferences, type SavedProject, type StorageEstimate } from './projectTypes.ts'

export type ProjectSaveState = 'saved' | 'unsaved' | 'saving' | 'opening' | 'duplicating' | 'deleting' | 'error'
export type ProjectManagerSnapshot = {
  currentProject: Pick<SavedProject, 'id' | 'name' | 'schemaVersion' | 'createdAt' | 'modifiedAt'> | null
  dirty: boolean
  saveState: ProjectSaveState
  error: string | null
  warning: string | null
  library: ProjectLibrarySummary[]
  storage: StorageEstimate
  databaseVersion: number
  storeNames: string[]
  lastTransaction: string | null
  migrationStatus: 'current' | 'none' | 'failed'
  missingAudioDataIds: string[]
  currentProjectEstimatedBytes: number
  runtimeAudioBufferCount: number
}

type Options = {
  engine: AudioEngine
  transport: CompositionTransport
  getPreferences: () => ProjectPreferences
  applyPreferences: (preferences: ProjectPreferences) => Promise<string | null>
}

function cloneProject(project: SavedProject) { return { ...project, layerOrder: [...project.layerOrder] } }

/** Coordinates project persistence without owning the AudioContext or composition transport. */
export class ProjectManager {
  private readonly options: Options
  private current: SavedProject | null = null
  private dirty = false
  private saveState: ProjectSaveState = 'saved'
  private error: string | null = null
  private warning: string | null = null
  private library: ProjectLibrarySummary[] = []
  private storage: StorageEstimate = { usage: null, quota: null, persistent: null }
  private lastTransaction: string | null = null
  private missingAudioDataIds: string[] = []
  private listeners = new Set<(snapshot: ProjectManagerSnapshot) => void>()
  private lastRevision: number
  private ignoreRevision = false
  private unsubscribe: (() => void) | null = null

  constructor(options: Options) {
    this.options = options
    this.lastRevision = options.transport.getSnapshot().persistenceRevision
    this.unsubscribe = options.transport.subscribe((snapshot) => {
      if (snapshot.persistenceRevision === this.lastRevision) return
      this.lastRevision = snapshot.persistenceRevision
      if (!this.ignoreRevision && (this.current || snapshot.composition)) { this.dirty = true; this.saveState = 'unsaved'; this.publish() }
    })
  }

  subscribe(listener: (snapshot: ProjectManagerSnapshot) => void) { this.listeners.add(listener); listener(this.getSnapshot()); return () => this.listeners.delete(listener) }
  getSnapshot(): ProjectManagerSnapshot {
    const runtime = this.options.transport.exportRuntimeState()
    const layers = runtime.composition?.layers ?? []
    return { currentProject: this.current ? { id: this.current.id, name: this.current.name, schemaVersion: this.current.schemaVersion, createdAt: this.current.createdAt, modifiedAt: this.current.modifiedAt } : null, dirty: this.dirty, saveState: this.saveState, error: this.error, warning: this.warning, library: this.library, storage: this.storage, databaseVersion: PROJECT_DATABASE_VERSION, storeNames: Object.values(PROJECT_STORES), lastTransaction: this.lastTransaction, migrationStatus: 'current', missingAudioDataIds: [...this.missingAudioDataIds], currentProjectEstimatedBytes: layers.reduce((total, layer) => total + layer.frameCount * layer.channelCount * 4, 0), runtimeAudioBufferCount: runtime.buffers.size }
  }

  async refreshLibrary() {
    try { this.library = await listProjects(); this.storage = await storageEstimate(); this.error = null; this.publish() }
    catch (error) { this.fail(error, 'Could not read the local Project Library.') }
  }

  async save(name?: string) {
    const target = this.current ? cloneProject(this.current) : this.newProjectMetadata(name ?? defaultProjectName())
    if (name !== undefined) target.name = validateProjectName(name)
    await this.persist(target, false)
  }

  async saveAs(name: string) {
    const target = this.newProjectMetadata(validateProjectName(name))
    await this.persist(target, true)
  }

  async open(projectId: string) {
    this.saveState = 'opening'; this.error = null; this.warning = null; this.publish()
    try {
      const bundle = await loadProjectBundle(projectId)
      if (bundle.project.schemaVersion > PROJECT_SCHEMA_VERSION) throw new Error('This project was saved by a newer HandChord version and cannot be opened safely.')
      this.options.engine.stop()
      const routing = await this.options.engine.getCompositionRouting()
      const runtimeBuffers = new Map<string, AudioBuffer>()
      const missing = [...bundle.missingAudioDataIds]
      for (const layer of bundle.layers) {
        const audio = bundle.audio.get(layer.audioDataId)
        if (!audio || audio.frameCount !== layer.frameCount || audio.sampleRate !== layer.sampleRate || audio.channelCount !== layer.channelCount || audio.channels.some((channel) => channel.length !== layer.frameCount)) { missing.push(layer.audioDataId); continue }
        const buffer = routing.context.createBuffer(audio.channelCount, audio.frameCount, audio.sampleRate)
        audio.channels.forEach((channel, index) => buffer.getChannelData(index).set(channel))
        runtimeBuffers.set(layer.id, buffer)
      }
      const session = this.sessionFromStored(bundle.project, bundle.layers)
      this.ignoreRevision = true
      this.options.transport.restoreRuntimeState({ composition: session, buffers: runtimeBuffers, settings: { bpm: bundle.project.bpm, barCount: bundle.project.barCount, countInBars: bundle.project.countInBars, metronomeEnabled: bundle.project.metronomeEnabled, metronomeGain: bundle.project.metronomeVolume } }, missing.length ? 'One or more layer audio records are unavailable. Select and delete the affected layer before playback or saving.' : null)
      this.ignoreRevision = false
      const preferenceWarning = await this.options.applyPreferences(preferencesFromProject(bundle.project))
      const openedAt = Date.now(); await markProjectOpened(projectId, openedAt)
      this.current = { ...bundle.project, lastOpenedAt: openedAt }
      this.dirty = false; this.saveState = 'saved'; this.missingAudioDataIds = [...new Set(missing)]; this.warning = preferenceWarning
      this.lastRevision = this.options.transport.getSnapshot().persistenceRevision
      await this.refreshLibrary(); this.lastTransaction = 'Opened project'; this.publish()
    } catch (error) { this.ignoreRevision = false; this.fail(error, 'The project could not be opened safely.') }
  }

  async rename(projectId: string, name: string) {
    const valid = validateProjectName(name)
    this.saveState = 'saving'; this.publish()
    try {
      await renameStoredProject(projectId, valid)
      if (this.current?.id === projectId) this.current = { ...this.current, name: valid, modifiedAt: Date.now() }
      this.saveState = this.dirty ? 'unsaved' : 'saved'; this.lastTransaction = 'Renamed project'; await this.refreshLibrary(); this.publish()
    } catch (error) { this.fail(error, 'The project could not be renamed.') }
  }

  async duplicate(projectId: string, name: string) {
    this.saveState = 'duplicating'; this.publish()
    try {
      const bundle = await loadProjectBundle(projectId)
      const duplicate = this.newProjectMetadata(validateProjectName(name), bundle.project)
      const timestamp = Date.now(); const layerIdMap = new Map(bundle.layers.map((layer) => [layer.id, createProjectId()]))
      const copiedLayers = bundle.layers.map((layer, order) => {
        const id = layerIdMap.get(layer.id)!; const audio = bundle.audio.get(layer.audioDataId)
        if (!audio) throw new Error(`Layer “${layer.name}” is missing audio and cannot be duplicated.`)
        const copiedAudio = createLayerAudioRecord(duplicate.id, { ...layer, id }, audio.channels, timestamp)
        return { layer: createSavedLayer(duplicate.id, { ...layer, id, order }, copiedAudio.id), audio: copiedAudio }
      })
      duplicate.layerOrder = copiedLayers.map(({ layer }) => layer.id); duplicate.activeLayerId = bundle.project.activeLayerId ? layerIdMap.get(bundle.project.activeLayerId) ?? null : null
      duplicate.beatCount = bundle.project.beatCount; duplicate.durationSeconds = bundle.project.durationSeconds; duplicate.sampleRate = bundle.project.sampleRate; duplicate.expectedFrameCount = bundle.project.expectedFrameCount
      await saveProjectBundle({ project: duplicate, layers: copiedLayers.map(({ layer }) => layer), audio: copiedLayers.map(({ audio }) => audio) })
      this.saveState = this.dirty ? 'unsaved' : 'saved'; this.lastTransaction = 'Duplicated project'; await this.refreshLibrary(); this.publish()
    } catch (error) { this.fail(error, 'The project could not be duplicated.') }
  }

  async delete(projectId: string) {
    this.saveState = 'deleting'; this.publish()
    try {
      await deleteStoredProject(projectId)
      if (this.current?.id === projectId) { this.current = null; this.dirty = true; this.saveState = 'unsaved'; this.warning = 'The saved project was deleted. Its open composition remains available as an unsaved project.' }
      else this.saveState = this.dirty ? 'unsaved' : 'saved'
      this.lastTransaction = 'Deleted project'; await this.refreshLibrary(); this.publish()
    } catch (error) { this.fail(error, 'The project could not be deleted.') }
  }

  newProject() {
    this.options.engine.stop()
    this.ignoreRevision = true; this.options.transport.newEmptyComposition(); this.ignoreRevision = false
    this.current = null; this.dirty = false; this.saveState = 'saved'; this.error = null; this.warning = null; this.missingAudioDataIds = []; this.lastTransaction = 'Created new unsaved project'; this.lastRevision = this.options.transport.getSnapshot().persistenceRevision; this.publish()
  }

  async requestPersistentStorage() {
    try { const granted = await requestPersistentStorage(); this.storage = await storageEstimate(); this.warning = granted ? 'Browser persistent storage was requested. Browser data can still be cleared manually.' : 'The browser did not grant persistent storage.'; this.publish() }
    catch (error) { this.fail(error, 'Persistent storage could not be requested.') }
  }

  dispose() { this.unsubscribe?.(); this.unsubscribe = null; this.listeners.clear() }

  /** Use for saved musical preferences controlled outside the composition transport. */
  markDirty() {
    if (!this.current || this.saveState === 'saving') return
    this.dirty = true; this.saveState = 'unsaved'; this.publish()
  }

  private async persist(target: SavedProject, isSaveAs: boolean) {
    this.saveState = 'saving'; this.error = null; this.publish()
    try {
      const input = this.buildSaveInput(target)
      const estimate = await storageEstimate()
      const requiredBytes = input.audio.reduce((total, record) => total + record.frameCount * record.channelCount * 4, 0)
      if (estimate.usage !== null && estimate.quota !== null && estimate.quota - estimate.usage < requiredBytes) throw new Error(`Available browser storage appears too low for this project (about ${Math.ceil(requiredBytes / (1024 * 1024))} MB needed). Free space and try again.`)
      await saveProjectBundle(input)
      this.current = input.project; this.dirty = false; this.saveState = 'saved'; this.warning = null; this.missingAudioDataIds = []
      this.lastRevision = this.options.transport.getSnapshot().persistenceRevision; this.lastTransaction = isSaveAs ? 'Saved project copy' : 'Saved project'
      await this.refreshLibrary(); this.publish()
    } catch (error) { this.fail(error, 'The project could not be saved. The prior saved version was kept.') }
  }

  private buildSaveInput(base: SavedProject) {
    const runtime = this.options.transport.exportRuntimeState(); const timestamp = Date.now(); const preferences = this.options.getPreferences()
    const layers = runtime.composition?.layers ?? []
    const project: SavedProject = { ...base, name: validateProjectName(base.name), schemaVersion: PROJECT_SCHEMA_VERSION, architectureVersion: PROJECT_ARCHITECTURE_VERSION, modifiedAt: timestamp, bpm: runtime.composition?.bpm ?? runtime.settings.bpm, timeSignature: '4/4', barCount: runtime.composition?.barCount ?? runtime.settings.barCount, beatCount: (runtime.composition?.barCount ?? runtime.settings.barCount) * 4, durationSeconds: runtime.composition?.durationSeconds ?? 0, sampleRate: runtime.composition?.sampleRate ?? 0, expectedFrameCount: runtime.composition?.expectedFrameCount ?? 0, activeLayerId: runtime.composition?.activeLayerId ?? null, layerOrder: layers.map((layer) => layer.id), key: preferences.root, scale: preferences.scale, metronomeEnabled: runtime.settings.metronomeEnabled, metronomeVolume: runtime.settings.metronomeGain, countInBars: runtime.settings.countInBars, masterVolume: preferences.masterVolume, selectedInstrumentId: preferences.selectedInstrumentId, selectedSoundSourceType: preferences.selectedSoundSourceType, selectedPersonalSoundId: preferences.selectedPersonalSoundId, projectStatus: 'ready' }
    const audio = layers.map((layer) => {
      const buffer = runtime.buffers.get(layer.id)
      if (!buffer) throw new Error(`Layer “${layer.name}” has missing audio and cannot be saved until it is removed.`)
      if (buffer.length !== layer.frameCount || buffer.sampleRate !== layer.sampleRate || buffer.numberOfChannels !== layer.channelCount) throw new Error(`Layer “${layer.name}” has an invalid AudioBuffer and cannot be saved.`)
      return createLayerAudioRecord(project.id, layer, Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel)), timestamp)
    })
    return { project, layers: layers.map((layer, index) => createSavedLayer(project.id, { ...layer, order: index }, audio[index]!.id)), audio }
  }

  private newProjectMetadata(name: string, source?: SavedProject): SavedProject {
    const now = Date.now(); const preferences = this.options.getPreferences(); const settings = this.options.transport.getSnapshot().settings
    return { id: createProjectId(), name: validateProjectName(name), schemaVersion: PROJECT_SCHEMA_VERSION, architectureVersion: PROJECT_ARCHITECTURE_VERSION, createdAt: now, modifiedAt: now, lastOpenedAt: now, bpm: source?.bpm ?? settings.bpm, timeSignature: '4/4', barCount: source?.barCount ?? settings.barCount, beatCount: source?.beatCount ?? settings.barCount * 4, durationSeconds: source?.durationSeconds ?? 0, sampleRate: source?.sampleRate ?? 0, expectedFrameCount: source?.expectedFrameCount ?? 0, activeLayerId: null, layerOrder: [], selectedInstrumentId: preferences.selectedInstrumentId, selectedSoundSourceType: preferences.selectedSoundSourceType, selectedPersonalSoundId: preferences.selectedPersonalSoundId, key: preferences.root, scale: preferences.scale, metronomeEnabled: settings.metronomeEnabled, metronomeVolume: settings.metronomeGain, countInBars: settings.countInBars, masterVolume: preferences.masterVolume, createdWithAppVersion: '0.0.0', projectStatus: 'ready' }
  }

  private sessionFromStored(project: SavedProject, layers: ReturnType<typeof normaliseLayers>): CompositionSession | null {
    if (layers.length === 0) return null
    if (new Set(layers.map((layer) => layer.id)).size !== layers.length || layers.some((layer) => layer.projectId !== project.id || layer.bpm !== project.bpm || layer.barCount !== project.barCount || layer.frameCount !== project.expectedFrameCount || layer.sampleRate !== project.sampleRate || layer.durationSeconds !== project.durationSeconds)) throw new Error('This project has invalid layer timing metadata.')
    const activeLayerId = project.activeLayerId && layers.some((layer) => layer.id === project.activeLayerId) ? project.activeLayerId : layers[0]!.id
    return { id: project.id, name: project.name, bpm: project.bpm, timeSignature: '4/4', barCount: project.barCount, durationSeconds: project.durationSeconds, sampleRate: project.sampleRate, expectedFrameCount: project.expectedFrameCount, layers: layers.map(({ projectId: _projectId, audioDataId: _audioDataId, ...layer }) => layer), activeLayerId, createdAt: project.createdAt, modifiedAt: project.modifiedAt, sessionOnly: true, architectureVersion: 2 }
  }

  private fail(error: unknown, fallback: string) { this.error = error instanceof Error ? error.message : fallback; this.saveState = 'error'; this.lastTransaction = 'Failed transaction'; this.publish() }
  private publish() { this.listeners.forEach((listener) => listener(this.getSnapshot())) }
}

function normaliseLayers(layers: import('./projectTypes.ts').SavedProjectLayer[]) { return layers }
