import { CHROMATIC_NOTES, type RootKey, type ScaleName } from '../music/MusicTheoryEngine.ts'
import { clampLayerVolume, validateLayerName } from '../composition/layerModel.ts'
import type { CompositionLayerMetadata } from '../composition/compositionTypes.ts'
import { PROJECT_NAME_MAX_LENGTH, PROJECT_SCHEMA_VERSION, type ProjectAudioRecord, type ProjectPreferences, type SavedProject, type SavedProjectLayer } from './projectTypes.ts'

const LOOP_BARS = new Set([1, 2, 4, 8])

export function createProjectId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `project-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function validateProjectName(value: string) {
  const name = value.trim()
  if (!name) throw new Error('A project name cannot be empty.')
  if (name.length > PROJECT_NAME_MAX_LENGTH) throw new Error(`Project names must be ${PROJECT_NAME_MAX_LENGTH} characters or shorter.`)
  return name
}

export function defaultProjectName() { return 'Untitled Project' }

export function isSupportedRootKey(value: unknown): value is RootKey { return typeof value === 'string' && CHROMATIC_NOTES.includes(value as RootKey) }
export function isSupportedScale(value: unknown): value is ScaleName { return value === 'major' || value === 'natural-minor' }

export function normaliseSavedProject(value: unknown): SavedProject | null {
  if (!value || typeof value !== 'object') return null
  const project = value as Partial<SavedProject>
  if (project.schemaVersion !== PROJECT_SCHEMA_VERSION || !Number.isFinite(project.architectureVersion) || typeof project.id !== 'string' || !project.id || typeof project.name !== 'string'
    || !Number.isFinite(project.createdAt) || !Number.isFinite(project.modifiedAt) || !Number.isFinite(project.bpm) || project.bpm! < 40 || project.bpm! > 220
    || project.timeSignature !== '4/4' || !LOOP_BARS.has(project.barCount as number) || !Number.isFinite(project.beatCount)
    || !Number.isFinite(project.durationSeconds) || project.durationSeconds! < 0 || !Number.isFinite(project.sampleRate) || project.sampleRate! < 0
    || !Number.isFinite(project.expectedFrameCount) || project.expectedFrameCount! < 0 || !Array.isArray(project.layerOrder)
    || !isSupportedRootKey(project.key) || !isSupportedScale(project.scale) || typeof project.metronomeEnabled !== 'boolean'
    || !Number.isFinite(project.metronomeVolume) || typeof project.selectedInstrumentId !== 'string'
    || (project.selectedSoundSourceType !== 'built-in' && project.selectedSoundSourceType !== 'personal-sample')
    || !(project.selectedPersonalSoundId === null || typeof project.selectedPersonalSoundId === 'string')
    || !Number.isFinite(project.masterVolume) || (project.countInBars !== 0 && project.countInBars !== 1 && project.countInBars !== 2)
    || (project.projectStatus !== 'ready' && project.projectStatus !== 'incomplete' && project.projectStatus !== 'corrupt' && project.projectStatus !== 'migrationRequired' && project.projectStatus !== 'unavailable')) return null
  try { validateProjectName(project.name) } catch { return null }
  return {
    id: project.id!, name: project.name.trim(), schemaVersion: project.schemaVersion!, architectureVersion: project.architectureVersion!, createdAt: project.createdAt!, modifiedAt: project.modifiedAt!, lastOpenedAt: project.lastOpenedAt ?? null,
    bpm: project.bpm!, timeSignature: '4/4', barCount: project.barCount!, beatCount: project.beatCount!, durationSeconds: project.durationSeconds!, sampleRate: project.sampleRate!, expectedFrameCount: project.expectedFrameCount!, activeLayerId: project.activeLayerId ?? null, layerOrder: [...project.layerOrder!],
    selectedInstrumentId: project.selectedInstrumentId!, selectedSoundSourceType: project.selectedSoundSourceType!, selectedPersonalSoundId: project.selectedPersonalSoundId ?? null,
    key: project.key!, scale: project.scale!, metronomeEnabled: project.metronomeEnabled!, metronomeVolume: Math.max(0, Math.min(0.5, project.metronomeVolume!)), countInBars: project.countInBars!, masterVolume: Math.max(0, Math.min(1, project.masterVolume!)), createdWithAppVersion: typeof project.createdWithAppVersion === 'string' ? project.createdWithAppVersion : 'unknown', projectStatus: project.projectStatus!,
  }
}

/** Version 1 is the first stored project shape. Version 0 is normalised only for early local builds. */
export function migrateSavedProject(value: unknown): SavedProject | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<SavedProject>
  if (raw.schemaVersion === 0) {
    return normaliseSavedProject({ ...raw, schemaVersion: PROJECT_SCHEMA_VERSION, architectureVersion: raw.architectureVersion ?? 1, createdWithAppVersion: raw.createdWithAppVersion ?? 'pre-project-release', projectStatus: raw.projectStatus ?? 'ready', lastOpenedAt: raw.lastOpenedAt ?? null })
  }
  return normaliseSavedProject(raw)
}

export function normaliseSavedLayer(value: unknown): SavedProjectLayer | null {
  if (!value || typeof value !== 'object') return null
  const layer = value as Partial<SavedProjectLayer>
  if (typeof layer.projectId !== 'string' || typeof layer.audioDataId !== 'string' || typeof layer.id !== 'string' || !layer.id
    || typeof layer.name !== 'string' || !Number.isFinite(layer.order) || !Number.isFinite(layer.bpm) || layer.timeSignature !== '4/4'
    || !LOOP_BARS.has(layer.barCount as number) || !Number.isFinite(layer.beatCount) || !Number.isFinite(layer.durationSeconds) || layer.durationSeconds! <= 0
    || !Number.isFinite(layer.sampleRate) || layer.sampleRate! <= 0 || !Number.isFinite(layer.frameCount) || layer.frameCount! <= 0
    || !Number.isFinite(layer.channelCount) || layer.channelCount! < 1 || typeof layer.muted !== 'boolean' || typeof layer.solo !== 'boolean'
    || !Number.isFinite(layer.volume) || typeof layer.sourceInstrumentId !== 'string' || (layer.sourceSoundType !== 'built-in' && layer.sourceSoundType !== 'personal-sample')
    || !Number.isFinite(layer.createdAt) || !Number.isFinite(layer.modifiedAt) || !Number.isFinite(layer.boundaryCrossfadeDuration)
    || !Number.isFinite(layer.recordingDiscrepancyFrames) || layer.recordingArchitectureVersion !== 1) return null
  try { validateLayerName(layer.name) } catch { return null }
  return { ...layer, name: layer.name.trim(), volume: clampLayerVolume(layer.volume!) } as SavedProjectLayer
}

export function normaliseProjectAudio(value: unknown): ProjectAudioRecord | null {
  if (!value || typeof value !== 'object') return null
  const audio = value as Partial<ProjectAudioRecord>
  if (typeof audio.id !== 'string' || typeof audio.projectId !== 'string' || typeof audio.layerId !== 'string'
    || !Number.isFinite(audio.sampleRate) || audio.sampleRate! <= 0 || !Number.isFinite(audio.frameCount) || audio.frameCount! <= 0
    || !Number.isFinite(audio.channelCount) || audio.channelCount! < 1 || !Array.isArray(audio.channels) || audio.channels.length !== audio.channelCount
    || !Number.isFinite(audio.createdAt)) return null
  if (!audio.channels.every((channel) => channel instanceof Float32Array && channel.length === audio.frameCount)) return null
  return audio as ProjectAudioRecord
}

export function createLayerAudioRecord(projectId: string, layer: CompositionLayerMetadata, channels: Float32Array[], timestamp: number): ProjectAudioRecord {
  if (channels.length !== layer.channelCount || channels.some((channel) => channel.length !== layer.frameCount)) throw new Error(`Layer “${layer.name}” cannot be saved because its PCM frame count is invalid.`)
  return { id: `${projectId}:audio:${layer.id}:${timestamp}`, projectId, layerId: layer.id, sampleRate: layer.sampleRate, frameCount: layer.frameCount, channelCount: layer.channelCount, channels: channels.map((channel) => channel.slice()), createdAt: timestamp }
}

export function createSavedLayer(projectId: string, layer: CompositionLayerMetadata, audioDataId: string): SavedProjectLayer { return { ...layer, projectId, audioDataId } }

export function preferencesFromProject(project: SavedProject): ProjectPreferences {
  return { root: project.key, scale: project.scale, masterVolume: project.masterVolume, selectedInstrumentId: project.selectedInstrumentId, selectedSoundSourceType: project.selectedSoundSourceType, selectedPersonalSoundId: project.selectedPersonalSoundId }
}
