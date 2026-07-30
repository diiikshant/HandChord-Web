import assert from 'node:assert/strict'
import test from 'node:test'
import { isPersonalSoundRecord, normalisePersonalSoundRecord } from './personalSoundStorage.ts'
import {
  applyLoopEdgeFades,
  calculateNormalisationGain,
  calculateNaturalVoiceDuration,
  clampLoopCrossfade,
  createSampleChordTiming,
  createLoopSettings,
  createWaveformPeaks,
  nearestSampleOctave,
  parseRootNote,
  reverseSamples,
  resolvePlaybackRegion,
  safeFadeDuration,
  samplePlaybackRate,
  sampleVoiceNotes,
  validateAudioFile,
  validateDuration,
  validateLoopRegion,
  validateTrim,
} from './sampleMath.ts'
import { DEFAULT_LOOP_CROSSFADE_SECONDS, MAX_PERSONAL_SOUND_BYTES, type PersonalSound } from './soundTypes.ts'

const sound: PersonalSound = { id: 'sample', name: 'Sample', sourceType: 'personal-sample', mode: 'instrument', originalFileName: 'sample.wav', originalMimeType: 'audio/wav', recordingDurationSeconds: null, rootMidiNote: 60, trimStartSeconds: 0, trimEndSeconds: 1, fadeInSeconds: 0.015, fadeOutSeconds: 0.015, normalisationGain: 1, reverse: false, loopEnabled: false, loopStartSeconds: 0, loopEndSeconds: 1, loopCrossfadeSeconds: DEFAULT_LOOP_CROSSFADE_SECONDS, createdAt: 1, modifiedAt: 1 }
const buffer = { length: 8, numberOfChannels: 2, getChannelData: (channel: number) => channel === 0 ? Float32Array.from([0, 0.25, -0.5, 0.75, 0, 0.1, -0.2, 0]) : Float32Array.from([0, -0.1, 0.3, -0.4, 0, 0.1, 0, 0]) } as unknown as AudioBuffer

test('validates supported local files, size, duration, and trim range', () => {
  assert.equal(validateAudioFile({ name: 'sound.wav', type: 'audio/wav', size: 1024 }).ok, true)
  assert.equal(validateAudioFile({ name: 'image.png', type: 'image/png', size: 1024 }).ok, false)
  assert.equal(validateAudioFile({ name: 'large.mp3', type: 'audio/mpeg', size: MAX_PERSONAL_SOUND_BYTES + 1 }).ok, false)
  assert.equal(validateDuration(10).ok, true)
  assert.equal(validateDuration(10.1).ok, false)
  assert.equal(validateTrim(0.1, 0.8, 1).ok, true)
  assert.equal(validateTrim(0.5, 0.55, 1).ok, false)
})

test('downsamples waveform peaks and calculates safe normalisation', () => {
  const peaks = createWaveformPeaks(buffer, 4)
  assert.equal(peaks.length, 4)
  assert.ok(peaks[1] >= 0.75)
  assert.ok(Math.abs(calculateNormalisationGain(buffer) - (0.85 / 0.75)) < 0.000001)
})

test('calculates safe fades and reverses copied sample data without mutating the input', () => {
  assert.equal(safeFadeDuration(0.2, 0.1), 0.05)
  assert.equal(safeFadeDuration(0.015, 1), 0.015)
  const input = Float32Array.from([0.25, -0.5, 1])
  assert.deepEqual([...reverseSamples(input)], [1, -0.5, 0.25])
  assert.deepEqual([...input], [0.25, -0.5, 1])
})

test('defaults loops off, restricts them to instruments, and derives them from the trim region', () => {
  const defaults = createLoopSettings('instrument', false, 0.2, 1.2)
  assert.equal(defaults.loopEnabled, false)
  const instrumentLoop = createLoopSettings('instrument', true, 0.2, 1.2)
  assert.deepEqual(instrumentLoop, { loopEnabled: true, loopStartSeconds: 0.2, loopEndSeconds: 1.2, loopCrossfadeSeconds: 0.03 })
  assert.equal(createLoopSettings('one-shot', true, 0.2, 1.2).loopEnabled, false)
  assert.equal(validateLoopRegion(0, 0.1, 0, 0.1).ok, false)
  assert.equal(clampLoopCrossfade(1, 0.12), 0.03)
})

test('preserves valid looping through reverse playback and softly fades copied loop edges', () => {
  const loopingSound = { ...sound, reverse: true, loopEnabled: true, trimStartSeconds: 1, trimEndSeconds: 3, loopStartSeconds: 1, loopEndSeconds: 3 }
  const region = resolvePlaybackRegion(loopingSound, 4)
  assert.deepEqual(region, { startSeconds: 1, endSeconds: 3, loopEnabled: true, loopStartSeconds: 1, loopEndSeconds: 3, loopCrossfadeSeconds: 0.03 })
  const faded = applyLoopEdgeFades(Float32Array.from({ length: 16 }, () => 1), 10, 0.2, 1.4, 0.2)
  assert.equal(faded[2], 0)
  assert.equal(faded[13], 0)
})

test('parses root notes and calculates clamped sample pitch rates', () => {
  assert.equal(parseRootNote('C', 4), 60)
  assert.equal(parseRootNote('A', 3), 57)
  assert.equal(parseRootNote('H', 4), null)
  assert.equal(samplePlaybackRate(72, 60), 2)
  assert.equal(samplePlaybackRate(36, 60), 0.5)
  assert.equal(nearestSampleOctave(76, 60), 64)
})

test('creates polyphonic instrument notes and preserves original one-shot pitch', () => {
  assert.deepEqual(sampleVoiceNotes(sound, [60, 64, 67]), [60, 64, 67])
  assert.deepEqual(sampleVoiceNotes({ ...sound, mode: 'one-shot' }, [60, 64, 67]), [60])
})

test('calculates natural pitched durations and synchronises a sampled chord to its shortest voice', () => {
  assert.equal(calculateNaturalVoiceDuration(2, 2), 1)
  assert.equal(calculateNaturalVoiceDuration(2, 0.5), 4)
  const timing = createSampleChordTiming(2, [0.5, 1, 2], 10.015, 0.015, 0.2)
  assert.deepEqual(timing.naturalVoiceDurations, [4, 2, 1])
  assert.equal(timing.sharedDurationSeconds, 1)
  assert.equal(timing.startTime, 10.015)
  assert.equal(timing.stopTime, 11.015)
  assert.equal(timing.releaseStartTime, timing.stopTime - timing.releaseSeconds)
  assert.ok(timing.releaseSeconds <= timing.sharedDurationSeconds * 0.45)
})

test('uses final clamped playback rates and safely clamps envelopes for very short samples', () => {
  const clampedHighRate = samplePlaybackRate(96, 60)
  const clampedLowRate = samplePlaybackRate(24, 60)
  assert.equal(clampedHighRate, 2)
  assert.equal(clampedLowRate, 0.5)
  const timing = createSampleChordTiming(0.08, [clampedLowRate, clampedHighRate], 1, 0.1, 0.1)
  assert.deepEqual(timing.naturalVoiceDurations, [0.16, 0.04])
  assert.equal(timing.sharedDurationSeconds, 0.04)
  assert.ok(timing.attackSeconds <= timing.sharedDurationSeconds * 0.35)
  assert.ok(timing.releaseSeconds <= timing.sharedDurationSeconds * 0.45)
  assert.ok(timing.releaseStartTime >= timing.startTime)
})

test('uses the actual trimmed duration for normal and reversed sample scheduling', () => {
  const trimmed = { ...sound, trimStartSeconds: 0.2, trimEndSeconds: 0.8 }
  const reversed = { ...trimmed, reverse: true }
  const normalRegion = resolvePlaybackRegion(trimmed, 1)
  const reversedRegion = resolvePlaybackRegion(reversed, 1)
  assert.ok(Math.abs((normalRegion.endSeconds - normalRegion.startSeconds) - 0.6) < 0.000001)
  assert.ok(Math.abs((reversedRegion.endSeconds - reversedRegion.startSeconds) - 0.6) < 0.000001)
  assert.ok(Math.abs(createSampleChordTiming(normalRegion.endSeconds - normalRegion.startSeconds, [2], 1, 0.015, 0.015).sharedDurationSeconds - 0.3) < 0.000001)
  assert.ok(Math.abs(createSampleChordTiming(reversedRegion.endSeconds - reversedRegion.startSeconds, [2], 1, 0.015, 0.015).sharedDurationSeconds - 0.3) < 0.000001)
})

test('safely rejects invalid IndexedDB records', () => {
  assert.equal(isPersonalSoundRecord({ id: 'broken' }), false)
  assert.equal(isPersonalSoundRecord({ ...sound, audioData: new ArrayBuffer(4) }), true)
  const recorded = normalisePersonalSoundRecord({ ...sound, sourceType: 'recorded', originalMimeType: 'audio/webm;codecs=opus', recordingDurationSeconds: 1, audioData: new ArrayBuffer(4) })
  assert.equal(recorded?.sourceType, 'recorded')
  assert.equal(recorded?.recordingDurationSeconds, 1)
})

test('loads older loop records safely and preserves looping settings when copied', () => {
  const legacyRecord = { ...sound, loop: true, audioData: new ArrayBuffer(4) }
  delete (legacyRecord as Partial<PersonalSound>).loopEnabled
  delete (legacyRecord as Partial<PersonalSound>).loopStartSeconds
  delete (legacyRecord as Partial<PersonalSound>).loopEndSeconds
  delete (legacyRecord as Partial<PersonalSound>).loopCrossfadeSeconds
  const migrated = normalisePersonalSoundRecord(legacyRecord)
  assert.ok(migrated)
  assert.equal(migrated.loopEnabled, true)
  assert.equal(migrated.loopStartSeconds, migrated.trimStartSeconds)
  assert.equal(migrated.loopEndSeconds, migrated.trimEndSeconds)
  assert.deepEqual({ ...migrated, id: 'copy' }.loopEnabled, true)

  const invalidRegion = normalisePersonalSoundRecord({ ...sound, loopEnabled: true, loopStartSeconds: 0.2, loopEndSeconds: 0.3, audioData: new ArrayBuffer(4) })
  assert.ok(invalidRegion)
  assert.equal(invalidRegion.loopEnabled, false)
})
