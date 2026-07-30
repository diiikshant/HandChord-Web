import assert from 'node:assert/strict'
import test from 'node:test'
import { createLayerAudioRecord, createProjectId, createSavedLayer, defaultProjectName, migrateSavedProject, normaliseProjectAudio, normaliseSavedLayer, normaliseSavedProject, validateProjectName } from './projectModel.ts'
import { PROJECT_DATABASE_VERSION, PROJECT_SCHEMA_VERSION, type SavedProject } from './projectTypes.ts'
import { PROJECT_STORES } from './projectStorage.ts'

const project: SavedProject = {
  id: 'project-1', name: 'Layered idea', schemaVersion: PROJECT_SCHEMA_VERSION, architectureVersion: 1, createdAt: 1, modifiedAt: 2, lastOpenedAt: null,
  bpm: 100, timeSignature: '4/4', barCount: 4, beatCount: 16, durationSeconds: 9.6, sampleRate: 48_000, expectedFrameCount: 460_800,
  activeLayerId: 'layer-1', layerOrder: ['layer-1'], selectedInstrumentId: 'warm-pad', selectedSoundSourceType: 'built-in', selectedPersonalSoundId: null,
  key: 'C', scale: 'major', metronomeEnabled: true, metronomeVolume: 0.18, countInBars: 1, masterVolume: 1, createdWithAppVersion: '0.0.0', projectStatus: 'ready',
}

const layer = {
  id: 'layer-1', name: 'Layer 1', order: 0, bpm: 100, timeSignature: '4/4' as const, barCount: 4 as const, beatCount: 16, durationSeconds: 9.6, sampleRate: 48_000, frameCount: 4, channelCount: 2,
  muted: false, solo: false, volume: 1, createdAt: 1, modifiedAt: 1, sourceInstrumentId: 'warm-pad', sourceSoundType: 'built-in' as const, boundaryCrossfadeDuration: 0.01, recordingDiscrepancyFrames: 0, recordingArchitectureVersion: 1 as const,
}

test('creates versioned serialisable projects without runtime Web Audio objects', () => {
  assert.equal(defaultProjectName(), 'Untitled Project')
  assert.equal(validateProjectName('  Layered idea  '), 'Layered idea')
  assert.throws(() => validateProjectName('   '))
  assert.deepEqual(normaliseSavedProject({ ...project, audioContext: {}, gain: {} }), project)
  assert.equal(PROJECT_DATABASE_VERSION, 1)
  assert.deepEqual(Object.values(PROJECT_STORES), ['projects', 'projectLayers', 'projectAudio'])
  assert.notEqual(createProjectId(), createProjectId())
})

test('keeps saved layer metadata and lossless channel PCM in separate records', () => {
  const channels = [new Float32Array([0, 0.2, -0.2, 0]), new Float32Array([0, 0.1, -0.1, 0])]
  const audio = createLayerAudioRecord(project.id, layer, channels, 3)
  const savedLayer = createSavedLayer(project.id, layer, audio.id)
  assert.equal(savedLayer.audioDataId, audio.id)
  assert.equal('channels' in savedLayer, false)
  assert.equal(audio.channelCount, 2)
  assert.equal(audio.frameCount, 4)
  assert.equal(audio.sampleRate, 48_000)
  assert.notEqual(audio.channels[0], channels[0])
  assert.equal(normaliseSavedLayer(savedLayer)?.volume, 1)
  assert.equal(normaliseProjectAudio(audio)?.channels[1]?.length, 4)
})

test('rejects corrupt project, layer, and PCM records safely', () => {
  assert.equal(normaliseSavedProject({ ...project, schemaVersion: 99 }), null)
  assert.equal(normaliseSavedProject({ ...project, bpm: 260 }), null)
  assert.equal(normaliseSavedLayer({ ...layer, projectId: project.id, audioDataId: 'audio', frameCount: 0 }), null)
  assert.equal(normaliseProjectAudio({ id: 'audio', projectId: project.id, layerId: layer.id, sampleRate: 48_000, frameCount: 4, channelCount: 2, channels: [new Float32Array(4)], createdAt: 1 }), null)
  assert.equal(migrateSavedProject({ ...project, schemaVersion: 0 })?.schemaVersion, PROJECT_SCHEMA_VERSION)
})
