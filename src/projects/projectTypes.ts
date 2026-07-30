import type { CompositionLayerMetadata, CompositionSettings, LoopBars } from '../composition/compositionTypes.ts'
import type { RootKey, ScaleName } from '../music/MusicTheoryEngine.ts'

export const PROJECT_DATABASE_NAME = 'handchord-projects'
export const PROJECT_DATABASE_VERSION = 1
export const PROJECT_SCHEMA_VERSION = 1
export const PROJECT_ARCHITECTURE_VERSION = 1
export const PROJECT_NAME_MAX_LENGTH = 64

export type ProjectStatus = 'ready' | 'saving' | 'incomplete' | 'corrupt' | 'migrationRequired' | 'unavailable'
export type ProjectSoundSourceType = 'built-in' | 'personal-sample'

/** This is safe to store: it intentionally has no Web Audio runtime objects. */
export type SavedProject = {
  id: string
  name: string
  schemaVersion: number
  architectureVersion: number
  createdAt: number
  modifiedAt: number
  lastOpenedAt: number | null
  bpm: number
  timeSignature: '4/4'
  barCount: LoopBars
  beatCount: number
  durationSeconds: number
  sampleRate: number
  expectedFrameCount: number
  activeLayerId: string | null
  layerOrder: string[]
  selectedInstrumentId: string
  selectedSoundSourceType: ProjectSoundSourceType
  selectedPersonalSoundId: string | null
  key: RootKey
  scale: ScaleName
  metronomeEnabled: boolean
  metronomeVolume: number
  countInBars: CompositionSettings['countInBars']
  masterVolume: number
  createdWithAppVersion: string
  projectStatus: ProjectStatus
}

export type SavedProjectLayer = CompositionLayerMetadata & {
  projectId: string
  audioDataId: string
}

/** Lossless composition capture: one copied Float32 channel per saved layer. */
export type ProjectAudioRecord = {
  id: string
  projectId: string
  layerId: string
  sampleRate: number
  frameCount: number
  channelCount: number
  channels: Float32Array[]
  createdAt: number
}

export type ProjectPreferences = {
  root: RootKey
  scale: ScaleName
  masterVolume: number
  selectedInstrumentId: string
  selectedSoundSourceType: ProjectSoundSourceType
  selectedPersonalSoundId: string | null
}

export type ProjectSaveInput = {
  project: SavedProject
  layers: SavedProjectLayer[]
  audio: ProjectAudioRecord[]
}

export type StoredProjectBundle = {
  project: SavedProject
  layers: SavedProjectLayer[]
  audio: Map<string, ProjectAudioRecord>
  missingAudioDataIds: string[]
}

export type ProjectLibrarySummary = Pick<SavedProject, 'id' | 'name' | 'createdAt' | 'modifiedAt' | 'lastOpenedAt' | 'bpm' | 'barCount' | 'durationSeconds' | 'projectStatus'> & { layerCount: number }

export type StorageEstimate = { usage: number | null; quota: number | null; persistent: boolean | null }

