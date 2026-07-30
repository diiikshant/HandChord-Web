import {
  MAX_PERSONAL_SOUND_BYTES,
  MAX_PERSONAL_SOUND_DURATION_SECONDS,
  MAX_LOOP_CROSSFADE_SECONDS,
  MAX_SAMPLE_PLAYBACK_RATE,
  DEFAULT_LOOP_CROSSFADE_SECONDS,
  MIN_LOOP_DURATION_SECONDS,
  MIN_SAMPLE_PLAYBACK_RATE,
  MIN_TRIM_DURATION_SECONDS,
  type PersonalSound,
} from './soundTypes.ts'

export type FileValidation = { ok: true } | { ok: false; reason: string }

const AUDIO_EXTENSIONS = ['wav', 'mp3', 'm4a', 'aac', 'ogg']

export function validateAudioFile(file: Pick<File, 'type' | 'name' | 'size'>): FileValidation {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if ((!file.type.startsWith('audio/') && !extension) || !extension || !AUDIO_EXTENSIONS.includes(extension)) {
    return { ok: false, reason: 'Choose a WAV, MP3, M4A/AAC, or OGG audio file your browser can decode.' }
  }
  if (file.size <= 0) return { ok: false, reason: 'The selected file is empty.' }
  if (file.size > MAX_PERSONAL_SOUND_BYTES) return { ok: false, reason: 'This file is larger than the 12 MB personal-sound limit.' }
  return { ok: true }
}

export function validateDuration(duration: number): FileValidation {
  if (!Number.isFinite(duration) || duration <= 0) return { ok: false, reason: 'The audio file has no usable duration.' }
  if (duration > MAX_PERSONAL_SOUND_DURATION_SECONDS) return { ok: false, reason: 'Personal sounds must be 10 seconds or shorter.' }
  return { ok: true }
}

export function validateTrim(start: number, end: number, duration: number): FileValidation {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > duration) return { ok: false, reason: 'Trim points must be inside the sample.' }
  if (end - start < MIN_TRIM_DURATION_SECONDS) return { ok: false, reason: 'Keep at least 80 ms of audio in the selected region.' }
  return { ok: true }
}

export function validateLoopRegion(loopStart: number, loopEnd: number, trimStart: number, trimEnd: number): FileValidation {
  if (!Number.isFinite(loopStart) || !Number.isFinite(loopEnd) || loopStart < trimStart || loopEnd > trimEnd) {
    return { ok: false, reason: 'The loop region must stay inside the selected trim region.' }
  }
  if (loopEnd - loopStart < MIN_LOOP_DURATION_SECONDS) {
    return { ok: false, reason: 'Loop Sample needs at least 120 ms of selected audio.' }
  }
  return { ok: true }
}

export function clampLoopCrossfade(requestedSeconds: number, loopDurationSeconds: number) {
  if (!Number.isFinite(requestedSeconds) || !Number.isFinite(loopDurationSeconds)) return 0
  return Math.max(0, Math.min(requestedSeconds, MAX_LOOP_CROSSFADE_SECONDS, loopDurationSeconds / 4))
}

export type LoopSettings = {
  loopEnabled: boolean
  loopStartSeconds: number
  loopEndSeconds: number
  loopCrossfadeSeconds: number
}

/** Uses the trim as the only loop range for this intentionally simple first version. */
export function createLoopSettings(
  mode: PersonalSound['mode'],
  requestedLoop: boolean,
  trimStartSeconds: number,
  trimEndSeconds: number,
  requestedCrossfadeSeconds = DEFAULT_LOOP_CROSSFADE_SECONDS,
): LoopSettings {
  const region = validateLoopRegion(trimStartSeconds, trimEndSeconds, trimStartSeconds, trimEndSeconds)
  const loopEnabled = mode === 'instrument' && requestedLoop && region.ok
  const loopDuration = Math.max(0, trimEndSeconds - trimStartSeconds)
  return {
    loopEnabled,
    loopStartSeconds: trimStartSeconds,
    loopEndSeconds: trimEndSeconds,
    loopCrossfadeSeconds: clampLoopCrossfade(requestedCrossfadeSeconds, loopDuration),
  }
}

export type PlaybackRegion = {
  startSeconds: number
  endSeconds: number
  loopEnabled: boolean
  loopStartSeconds: number
  loopEndSeconds: number
  loopCrossfadeSeconds: number
}

/** Converts stored original-buffer times into the reversed buffer's coordinates when needed. */
export function resolvePlaybackRegion(sound: PersonalSound, bufferDurationSeconds: number): PlaybackRegion {
  const startSeconds = sound.reverse ? bufferDurationSeconds - sound.trimEndSeconds : sound.trimStartSeconds
  const endSeconds = sound.reverse ? bufferDurationSeconds - sound.trimStartSeconds : sound.trimEndSeconds
  const loopStartSeconds = sound.reverse ? bufferDurationSeconds - sound.loopEndSeconds : sound.loopStartSeconds
  const loopEndSeconds = sound.reverse ? bufferDurationSeconds - sound.loopStartSeconds : sound.loopEndSeconds
  return { startSeconds, endSeconds, loopEnabled: sound.mode === 'instrument' && sound.loopEnabled, loopStartSeconds, loopEndSeconds, loopCrossfadeSeconds: sound.loopCrossfadeSeconds }
}

/** Adds short zero-crossing-like edge fades to a copied loop buffer to reduce boundary clicks. */
export function applyLoopEdgeFades(
  samples: Float32Array,
  sampleRate: number,
  loopStartSeconds: number,
  loopEndSeconds: number,
  crossfadeSeconds: number,
) {
  const output = new Float32Array(samples)
  const start = Math.max(0, Math.floor(loopStartSeconds * sampleRate))
  const end = Math.min(output.length, Math.ceil(loopEndSeconds * sampleRate))
  const frameCount = Math.min(Math.floor(crossfadeSeconds * sampleRate), Math.floor((end - start) / 4))
  if (frameCount <= 1) return output
  for (let index = 0; index < frameCount; index += 1) {
    const progress = index / (frameCount - 1)
    output[start + index] *= progress
    output[end - frameCount + index] *= 1 - progress
  }
  return output
}

export function createWaveformPeaks(buffer: AudioBuffer, peakCount = 160): number[] {
  const peaks = Array.from({ length: peakCount }, () => 0)
  const blockSize = Math.max(1, Math.floor(buffer.length / peakCount))
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel)
    for (let bucket = 0; bucket < peakCount; bucket += 1) {
      const start = bucket * blockSize
      const end = Math.min(data.length, start + blockSize)
      let peak = 0
      for (let index = start; index < end; index += 1) peak = Math.max(peak, Math.abs(data[index]))
      peaks[bucket] = Math.max(peaks[bucket], peak)
    }
  }
  return peaks
}

export function calculateNormalisationGain(buffer: AudioBuffer): number {
  let peak = 0
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel)
    for (let index = 0; index < data.length; index += 1) peak = Math.max(peak, Math.abs(data[index]))
  }
  if (peak < 0.01) return 1
  return Math.min(4, 0.85 / peak)
}

export function reverseAudioBuffer(context: AudioContext, source: AudioBuffer): AudioBuffer {
  const reversed = context.createBuffer(source.numberOfChannels, source.length, source.sampleRate)
  for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
    const input = source.getChannelData(channel)
    const output = reversed.getChannelData(channel)
    output.set(reverseSamples(input))
  }
  return reversed
}

/** Returns a new array so reversing a sound never mutates its decoded original buffer. */
export function reverseSamples(samples: Float32Array) {
  const reversed = new Float32Array(samples.length)
  for (let index = 0; index < samples.length; index += 1) reversed[index] = samples[samples.length - 1 - index]
  return reversed
}

/** Keeps the two edge fades inside the selected sample region. */
export function safeFadeDuration(requestedSeconds: number, selectedDurationSeconds: number) {
  if (!Number.isFinite(requestedSeconds) || !Number.isFinite(selectedDurationSeconds)) return 0
  return Math.max(0, Math.min(requestedSeconds, Math.max(0, selectedDurationSeconds / 2)))
}

export function midiSemitoneDifference(note: number, rootMidiNote: number) {
  return note - rootMidiNote
}

export function samplePlaybackRate(note: number, rootMidiNote: number) {
  const rate = 2 ** (midiSemitoneDifference(note, rootMidiNote) / 12)
  return Math.min(MAX_SAMPLE_PLAYBACK_RATE, Math.max(MIN_SAMPLE_PLAYBACK_RATE, rate))
}

export const SAMPLE_CHORD_LOOKAHEAD_SECONDS = 0.015
export const MIN_SCHEDULED_SAMPLE_DURATION_SECONDS = 0.012

export type SampleChordTiming = {
  startTime: number
  sharedDurationSeconds: number
  attackSeconds: number
  releaseSeconds: number
  releaseStartTime: number
  stopTime: number
  naturalVoiceDurations: number[]
}

/** A higher playback rate consumes the same trimmed buffer in less wall-clock time. */
export function calculateNaturalVoiceDuration(playableDurationSeconds: number, finalPlaybackRate: number) {
  if (!Number.isFinite(playableDurationSeconds) || !Number.isFinite(finalPlaybackRate) || playableDurationSeconds <= 0 || finalPlaybackRate <= 0) return 0
  return playableDurationSeconds / finalPlaybackRate
}

/**
 * Gives a non-looping sampled chord one timeline. The shortest pitched voice
 * determines the group length so a lower voice is intentionally truncated,
 * rather than allowing every note to end at a different time.
 */
export function createSampleChordTiming(
  playableDurationSeconds: number,
  finalPlaybackRates: number[],
  startTime: number,
  requestedAttackSeconds: number,
  requestedReleaseSeconds: number,
): SampleChordTiming {
  const naturalVoiceDurations = finalPlaybackRates.map((rate) => calculateNaturalVoiceDuration(playableDurationSeconds, rate))
  const sharedDurationSeconds = Math.min(...naturalVoiceDurations)
  if (!Number.isFinite(startTime) || sharedDurationSeconds < MIN_SCHEDULED_SAMPLE_DURATION_SECONDS) {
    throw new Error('This selected sample region is too short to play safely at the requested pitch.')
  }

  // Keep attack and release inside a short sample instead of creating overlapping
  // or backwards Web Audio automation times.
  const attackSeconds = Math.min(Math.max(0, requestedAttackSeconds), sharedDurationSeconds * 0.35)
  const releaseSeconds = Math.min(
    Math.max(0, requestedReleaseSeconds),
    sharedDurationSeconds * 0.45,
    Math.max(0, sharedDurationSeconds - attackSeconds),
  )
  const stopTime = startTime + sharedDurationSeconds
  return {
    startTime,
    sharedDurationSeconds,
    attackSeconds,
    releaseSeconds,
    releaseStartTime: stopTime - releaseSeconds,
    stopTime,
    naturalVoiceDurations,
  }
}

export function nearestSampleOctave(note: number, rootMidiNote: number) {
  let adjusted = note
  while (adjusted - rootMidiNote > 12) adjusted -= 12
  while (adjusted - rootMidiNote < -12) adjusted += 12
  return adjusted
}

export function parseRootNote(noteName: string, octave: number) {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const index = names.indexOf(noteName)
  return index < 0 || !Number.isInteger(octave) ? null : (octave + 1) * 12 + index
}

export function sampleVoiceNotes(sound: PersonalSound, chordMidiNotes: number[]) {
  return sound.mode === 'instrument'
    ? [...new Set(chordMidiNotes)].slice(0, 6).map((note) => nearestSampleOctave(note, sound.rootMidiNote))
    : [sound.rootMidiNote]
}
