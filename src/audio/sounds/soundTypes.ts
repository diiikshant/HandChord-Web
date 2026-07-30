import type { InstrumentId } from '../instruments/instrumentTypes.ts'

export type PersonalSoundMode = 'instrument' | 'one-shot'
export type PersonalSoundSourceType = 'personal-sample' | 'recorded'

export type PersonalSound = {
  id: string
  name: string
  sourceType: PersonalSoundSourceType
  mode: PersonalSoundMode
  originalFileName: string
  originalMimeType: string | null
  recordingDurationSeconds: number | null
  rootMidiNote: number
  trimStartSeconds: number
  trimEndSeconds: number
  fadeInSeconds: number
  fadeOutSeconds: number
  normalisationGain: number
  reverse: boolean
  loopEnabled: boolean
  loopStartSeconds: number
  loopEndSeconds: number
  loopCrossfadeSeconds: number
  createdAt: number
  modifiedAt: number
}

export type PersonalSoundRecord = PersonalSound & { audioData: ArrayBuffer }

export type SoundSource =
  | { type: 'built-in'; instrumentId: InstrumentId }
  | { type: 'personal-sample'; soundId: string }

export const MAX_PERSONAL_SOUND_BYTES = 12 * 1024 * 1024
export const MAX_PERSONAL_SOUND_DURATION_SECONDS = 10
export const MIN_TRIM_DURATION_SECONDS = 0.08
export const DEFAULT_FADE_SECONDS = 0.015
export const MIN_LOOP_DURATION_SECONDS = 0.12
export const DEFAULT_LOOP_CROSSFADE_SECONDS = 0.03
export const MAX_LOOP_CROSSFADE_SECONDS = 0.05
export const MIN_SAMPLE_PLAYBACK_RATE = 0.5
export const MAX_SAMPLE_PLAYBACK_RATE = 2
