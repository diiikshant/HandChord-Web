export type TransportState = 'idle' | 'armed' | 'countingIn' | 'recording' | 'processing' | 'loopReady' | 'playing' | 'stopped' | 'error'

export type CountInBars = 0 | 1 | 2
export type LoopBars = 1 | 2 | 4 | 8

export type CompositionSettings = {
  bpm: number
  barCount: LoopBars
  countInBars: CountInBars
  metronomeEnabled: boolean
  metronomeGain: number
}

export type CompositionLoopMetadata = {
  id: string
  name: string
  bpm: number
  timeSignature: '4/4'
  barCount: LoopBars
  beatCount: number
  durationSeconds: number
  sampleRate: number
  frameCount: number
  channelCount: number
  createdAt: number
  sourceInstrumentId: string
  boundaryCrossfadeDuration: number
  recordingDiscrepancyFrames: number
  recordingArchitectureVersion: 1
}

export type CompositionLoop = {
  buffer: AudioBuffer
  metadata: CompositionLoopMetadata
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

export type CompositionTransportSnapshot = {
  state: TransportState
  settings: CompositionSettings
  loop: CompositionLoop | null
  undoLoop: CompositionLoop | null
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
}

export const DEFAULT_COMPOSITION_SETTINGS: CompositionSettings = {
  bpm: 100,
  barCount: 4,
  countInBars: 1,
  metronomeEnabled: true,
  metronomeGain: 0.18,
}
