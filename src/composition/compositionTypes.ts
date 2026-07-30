export type TransportState = 'idle' | 'armed' | 'countingIn' | 'recordingLayer' | 'processingLayer' | 'compositionReady' | 'playing' | 'stopped' | 'replacingLayer' | 'error'
export type CountInBars = 0 | 1 | 2
export type LoopBars = 1 | 2 | 4 | 8
export const MAX_COMPOSITION_LAYERS = 4

export type CompositionSettings = {
  bpm: number
  barCount: LoopBars
  countInBars: CountInBars
  metronomeEnabled: boolean
  metronomeGain: number
}

/** Serializable by design: runtime AudioBuffers belong in a separate in-memory store. */
export type CompositionLayerMetadata = {
  id: string
  name: string
  order: number
  bpm: number
  timeSignature: '4/4'
  barCount: LoopBars
  beatCount: number
  durationSeconds: number
  sampleRate: number
  frameCount: number
  channelCount: number
  muted: boolean
  solo: boolean
  volume: number
  createdAt: number
  modifiedAt: number
  sourceInstrumentId: string
  sourceSoundType: 'built-in' | 'personal-sample'
  boundaryCrossfadeDuration: number
  recordingDiscrepancyFrames: number
  recordingArchitectureVersion: 1
}

export type CompositionSession = {
  id: string
  name: string
  bpm: number
  timeSignature: '4/4'
  barCount: LoopBars
  durationSeconds: number
  sampleRate: number
  expectedFrameCount: number
  layers: CompositionLayerMetadata[]
  activeLayerId: string | null
  createdAt: number
  modifiedAt: number
  sessionOnly: true
  architectureVersion: 2
}

/** Runtime buffers deliberately live outside serialisable composition metadata. */
export type CompositionRuntimeState = {
  composition: CompositionSession | null
  buffers: Map<string, AudioBuffer>
  settings: CompositionSettings
}

export type TransportSchedule = {
  secondsPerBeat: number
  secondsPerBar: number
  loopDurationSeconds: number
  countInDurationSeconds: number
  countInStartTime: number
  recordingStartTime: number
  recordingEndTime: number
  startFrame: number
  endFrame: number
  expectedFrameCount: number
}

export type UndoAction = 'delete-layer' | 'replace-layer' | 'clear-composition' | null

export type CompositionTransportSnapshot = {
  state: TransportState
  settings: CompositionSettings
  composition: CompositionSession | null
  error: string | null
  warning: string | null
  schedule: TransportSchedule | null
  currentBar: number
  currentBeat: number
  remainingCountInBars: number
  loopCycleCount: number
  playbackActive: boolean
  workletStatus: 'idle' | 'loading' | 'ready' | 'error'
  recordingTapActive: boolean
  receivedFrameCount: number
  undoAction: UndoAction
  sourceGroupSize: number
  persistenceRevision: number
  sharedPlaybackStartTime: number | null
  compositionBusActive: boolean
  audibleLayerIds: string[]
  mutedLayerIds: string[]
  soloedLayerIds: string[]
  runtimeBufferIds: string[]
  pendingSilentLayerId: string | null
}

export const DEFAULT_COMPOSITION_SETTINGS: CompositionSettings = { bpm: 100, barCount: 4, countInBars: 1, metronomeEnabled: true, metronomeGain: 0.18 }
