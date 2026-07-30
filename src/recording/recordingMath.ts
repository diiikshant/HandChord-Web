import { MAX_PERSONAL_SOUND_DURATION_SECONDS, MIN_TRIM_DURATION_SECONDS } from '../audio/sounds/soundTypes.ts'

export const MAX_RECORDING_SECONDS = MAX_PERSONAL_SOUND_DURATION_SECONDS
export const SILENCE_THRESHOLD = 0.015

export type SilenceSuggestion = {
  trimStartSeconds: number
  trimEndSeconds: number
  nearlySilent: boolean
}

/** Chooses a format only after the browser confirms that its MediaRecorder can use it. */
export function selectRecordingMimeType(isTypeSupported: (mimeType: string) => boolean) {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
  ]
  return candidates.find((mimeType) => isTypeSupported(mimeType)) ?? null
}

/** Finds quiet leading/trailing frames only; it never removes quiet material from the middle. */
export function detectSilenceBoundaries(buffer: Pick<AudioBuffer, 'length' | 'numberOfChannels' | 'sampleRate' | 'duration' | 'getChannelData'>): SilenceSuggestion {
  let firstAudible = buffer.length
  let lastAudible = -1
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const samples = buffer.getChannelData(channel)
    for (let index = 0; index < samples.length; index += 1) {
      if (Math.abs(samples[index]) >= SILENCE_THRESHOLD) {
        firstAudible = Math.min(firstAudible, index)
        lastAudible = Math.max(lastAudible, index)
      }
    }
  }
  if (lastAudible < firstAudible) {
    return { trimStartSeconds: 0, trimEndSeconds: buffer.duration, nearlySilent: true }
  }
  const start = firstAudible / buffer.sampleRate
  const end = Math.min(buffer.duration, (lastAudible + 1) / buffer.sampleRate)
  if (end - start < MIN_TRIM_DURATION_SECONDS) {
    return { trimStartSeconds: 0, trimEndSeconds: buffer.duration, nearlySilent: true }
  }
  return { trimStartSeconds: start, trimEndSeconds: end, nearlySilent: false }
}

export type RecordingPhase =
  | 'not-requested'
  | 'requesting-permission'
  | 'permission-granted'
  | 'permission-denied'
  | 'microphone-unavailable'
  | 'microphone-busy'
  | 'countdown'
  | 'recording'
  | 'recording-stopped'
  | 'processing-recording'
  | 'recording-error'

export type RecordingTransition = 'request' | 'granted' | 'countdown' | 'record' | 'stop' | 'process' | 'cancel' | 'denied' | 'unavailable' | 'busy' | 'error'

/** A pure, deterministic status map used by the recorder controller and its tests. */
export function nextRecordingPhase(event: RecordingTransition): RecordingPhase {
  const phases: Record<RecordingTransition, RecordingPhase> = {
    request: 'requesting-permission', granted: 'permission-granted', countdown: 'countdown', record: 'recording', stop: 'recording-stopped', process: 'processing-recording', cancel: 'not-requested', denied: 'permission-denied', unavailable: 'microphone-unavailable', busy: 'microphone-busy', error: 'recording-error',
  }
  return phases[event]
}

export function remainingRecordingSeconds(elapsedSeconds: number) {
  return Math.max(0, MAX_RECORDING_SECONDS - Math.max(0, elapsedSeconds))
}

export function isRecordingSessionActive(phase: RecordingPhase) {
  return phase === 'requesting-permission' || phase === 'permission-granted' || phase === 'countdown' || phase === 'recording' || phase === 'recording-stopped' || phase === 'processing-recording'
}

/** Stops only the stream explicitly handed to the microphone recorder. */
export function stopOwnedMediaTracks(stream: Pick<MediaStream, 'getTracks'>) {
  stream.getTracks().forEach((track) => track.stop())
}
