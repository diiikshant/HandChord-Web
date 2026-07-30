import { applyLoopEdgeFades, createSampleChordTiming, resolvePlaybackRegion, safeFadeDuration, SAMPLE_CHORD_LOOKAHEAD_SECONDS, samplePlaybackRate, sampleVoiceNotes, validateLoopRegion, type PlaybackRegion, type SampleChordTiming } from './sampleMath.ts'
import type { PersonalSound } from './soundTypes.ts'

type SampleVoice = {
  source: AudioBufferSourceNode
  gain: GainNode
  naturalDurationSeconds: number
  released: boolean
  cleanedUp: boolean
}

type SampleVoiceGroup = {
  id: string
  startTime: number
  timing: SampleChordTiming | null
  releaseSeconds: number
  looping: boolean
  voices: Map<string, SampleVoice>
  released: boolean
  cleanupComplete: boolean
}

export type SampleVoiceGroupDiagnostics = {
  groupCount: number
  memberVoiceCount: number
  looping: boolean
  sharedDurationSeconds: number | null
  startTime: number | null
  releaseStartTime: number | null
  stopTime: number | null
  naturalVoiceDurations: number[]
}

/** Creates one-use AudioBufferSourceNode voices while sharing the existing effects output. */
export class SampleInstrument {
  private readonly context: AudioContext
  private readonly output: AudioNode
  private readonly voiceGroups = new Map<string, SampleVoiceGroup>()
  private readonly independentVoices = new Map<string, SampleVoice>()
  private sound: PersonalSound | null = null
  private buffer: AudioBuffer | null = null
  private playbackRegion: PlaybackRegion | null = null
  private voiceSequence = 0
  private lastPlaybackRates: number[] = []

  constructor(context: AudioContext, output: AudioNode) { this.context = context; this.output = output }

  setSound(sound: PersonalSound, buffer: AudioBuffer) {
    this.releaseAll()
    const region = resolvePlaybackRegion(sound, buffer.duration)
    this.sound = sound
    this.playbackRegion = region
    this.buffer = region.loopEnabled ? this.createLoopSafeBuffer(buffer, region) : buffer
  }
  clearSound() { this.releaseAll(); this.sound = null; this.buffer = null; this.playbackRegion = null }
  get activeVoiceCount() {
    let groupedVoiceCount = 0
    this.voiceGroups.forEach((group) => { groupedVoiceCount += group.voices.size })
    return groupedVoiceCount + this.independentVoices.size
  }
  get playbackRates() { return this.lastPlaybackRates }
  get voiceGroupDiagnostics(): SampleVoiceGroupDiagnostics {
    const latestGroup = [...this.voiceGroups.values()].at(-1) ?? null
    let memberVoiceCount = 0
    this.voiceGroups.forEach((group) => { memberVoiceCount += group.voices.size })
    return {
      groupCount: this.voiceGroups.size,
      memberVoiceCount,
      looping: latestGroup?.looping ?? false,
      sharedDurationSeconds: latestGroup?.timing?.sharedDurationSeconds ?? null,
      startTime: latestGroup?.timing?.startTime ?? latestGroup?.startTime ?? null,
      releaseStartTime: latestGroup?.timing?.releaseStartTime ?? null,
      stopTime: latestGroup?.timing?.stopTime ?? null,
      naturalVoiceDurations: latestGroup?.timing?.naturalVoiceDurations ?? [],
    }
  }

  playChord(chordId: string, midiNotes: number[]) {
    if (!this.sound || !this.buffer) throw new Error('The selected personal sound has no decoded audio data.')
    this.releaseAll()
    this.lastPlaybackRates = []
    const notes = sampleVoiceNotes(this.sound, midiNotes)
    if (this.sound.mode === 'one-shot') {
      this.startIndependentVoice('one-shot', notes[0])
      return
    }
    this.startChordVoiceGroup(chordId, notes)
  }

  preview(sound: PersonalSound, buffer: AudioBuffer) {
    this.releaseAll()
    this.lastPlaybackRates = []
    // Preview always ends after the selected region so it cannot leave a loop running.
    const previewSound = { ...sound, loopEnabled: false }
    this.startIndependentVoice('preview', previewSound.rootMidiNote, previewSound, buffer, resolvePlaybackRegion(previewSound, buffer.duration))
  }

  releaseAll() {
    const now = this.context.currentTime
    this.voiceGroups.forEach((group) => this.releaseGroup(group, now))
    this.independentVoices.forEach((voice) => this.releaseVoice(voice, now, safeFadeDuration(this.sound?.fadeOutSeconds ?? 0.015, 0.08)))
  }

  dispose() { this.releaseAll(); this.clearSound() }

  private startChordVoiceGroup(chordId: string, notes: number[]) {
    if (!this.sound || !this.buffer || !this.playbackRegion) return
    const sound = this.sound
    const buffer = this.buffer
    const region = this.playbackRegion
    const playableDurationSeconds = region.endSeconds - region.startSeconds
    const playbackRates = notes.map((note) => samplePlaybackRate(note, sound.rootMidiNote))
    const startTime = this.context.currentTime + SAMPLE_CHORD_LOOKAHEAD_SECONDS
    const timing = region.loopEnabled
      ? null
      : createSampleChordTiming(playableDurationSeconds, playbackRates, startTime, sound.fadeInSeconds, sound.fadeOutSeconds)
    const group: SampleVoiceGroup = {
      id: `${chordId}-${this.voiceSequence += 1}`,
      startTime,
      timing,
      releaseSeconds: timing?.releaseSeconds ?? safeFadeDuration(sound.fadeOutSeconds, playableDurationSeconds),
      looping: region.loopEnabled,
      voices: new Map(),
      released: false,
      cleanupComplete: false,
    }
    this.voiceGroups.set(group.id, group)
    playbackRates.forEach((rate, index) => this.startGroupedVoice(group, `${chordId}-${index}`, rate, sound, buffer, region))
  }

  private startGroupedVoice(group: SampleVoiceGroup, id: string, rate: number, sound: PersonalSound, buffer: AudioBuffer, region: PlaybackRegion) {
    const source = this.context.createBufferSource()
    const gain = this.context.createGain()
    const startTime = group.startTime
    const playableDurationSeconds = region.endSeconds - region.startSeconds
    const naturalDurationSeconds = playableDurationSeconds / rate
    source.buffer = buffer
    source.playbackRate.setValueAtTime(rate, startTime)
    source.loop = group.looping
    source.loopStart = region.loopStartSeconds
    source.loopEnd = region.loopEndSeconds
    const attackSeconds = group.timing?.attackSeconds ?? safeFadeDuration(sound.fadeInSeconds, playableDurationSeconds)
    gain.gain.setValueAtTime(0.0001, startTime)
    gain.gain.linearRampToValueAtTime(sound.normalisationGain, startTime + attackSeconds)
    if (group.timing) {
      const { releaseStartTime, stopTime } = group.timing
      gain.gain.setValueAtTime(sound.normalisationGain, releaseStartTime)
      if (group.timing.releaseSeconds > 0) gain.gain.exponentialRampToValueAtTime(0.0001, stopTime)
      else gain.gain.setValueAtTime(0.0001, stopTime)
    }
    source.connect(gain).connect(this.output)
    const voiceId = `${id}-${this.voiceSequence += 1}`
    const voice: SampleVoice = { source, gain, naturalDurationSeconds, released: false, cleanedUp: false }
    source.onended = () => this.cleanupGroupedVoice(group, voiceId, voice)
    // All members use this exact timestamp. The duration parameter remains the
    // selected buffer-time region; the shared envelope and stop time set the
    // common audible lifetime in AudioContext time.
    const sourceDurationSeconds = group.timing
      ? Math.min(playableDurationSeconds, group.timing.sharedDurationSeconds * rate)
      : undefined
    source.start(startTime, region.startSeconds, sourceDurationSeconds)
    if (group.timing) {
      try { source.stop(group.timing.stopTime) } catch { /* A finished one-use source is already safe. */ }
    }
    group.voices.set(voiceId, voice)
    this.lastPlaybackRates.push(rate)
  }

  private startIndependentVoice(id: string, note: number, configuredSound = this.sound, configuredBuffer = this.buffer, configuredRegion = this.playbackRegion) {
    if (!configuredSound || !configuredBuffer || !configuredRegion) return
    const sound = configuredSound
    const buffer = configuredBuffer
    const region = configuredRegion
    const duration = region.endSeconds - region.startSeconds
    const source = this.context.createBufferSource()
    const gain = this.context.createGain()
    const now = this.context.currentTime
    const rate = sound.mode === 'instrument' ? samplePlaybackRate(note, sound.rootMidiNote) : 1
    const fadeInSeconds = safeFadeDuration(sound.fadeInSeconds, duration)
    source.buffer = buffer
    source.playbackRate.setValueAtTime(rate, now)
    source.loop = region.loopEnabled
    source.loopStart = region.loopStartSeconds
    source.loopEnd = region.loopEndSeconds
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.linearRampToValueAtTime(sound.normalisationGain, now + fadeInSeconds)
    source.connect(gain).connect(this.output)
    // A source can only start once. Give every triggered voice a unique key so an
    // older voice ending cannot remove a newer voice that plays the same chord.
    const voiceId = `${id}-${this.voiceSequence += 1}`
    const voice: SampleVoice = { source, gain, naturalDurationSeconds: duration / rate, released: false, cleanedUp: false }
    source.onended = () => this.cleanupIndependentVoice(voiceId, voice)
    source.start(now, region.startSeconds, source.loop ? undefined : duration)
    this.lastPlaybackRates.push(rate)
    this.independentVoices.set(voiceId, voice)
  }

  private releaseGroup(group: SampleVoiceGroup, now: number) {
    if (group.released) return
    group.released = true
    const releaseStartTime = Math.max(now, group.startTime)
    const releaseSeconds = group.timing?.releaseSeconds ?? group.releaseSeconds
    const stopTime = releaseStartTime + releaseSeconds
    if (group.timing) {
      group.timing = { ...group.timing, releaseStartTime, stopTime }
    }
    group.voices.forEach((voice) => this.releaseVoice(voice, releaseStartTime, releaseSeconds))
  }

  private releaseVoice(voice: SampleVoice, now: number, releaseSeconds: number) {
    if (voice.released) return
    voice.released = true
    voice.gain.gain.cancelScheduledValues(now)
    voice.gain.gain.setValueAtTime(Math.max(voice.gain.gain.value, 0.0001), now)
    if (releaseSeconds > 0) voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + releaseSeconds)
    else voice.gain.gain.setValueAtTime(0.0001, now)
    try { voice.source.stop(now + releaseSeconds) } catch { /* An already-ended one-use source is safe to ignore. */ }
  }

  private cleanupGroupedVoice(group: SampleVoiceGroup, voiceId: string, voice: SampleVoice) {
    if (voice.cleanedUp) return
    voice.cleanedUp = true
    voice.source.disconnect()
    voice.gain.disconnect()
    group.voices.delete(voiceId)
    if (group.voices.size === 0) {
      group.cleanupComplete = true
      this.voiceGroups.delete(group.id)
    }
  }

  private cleanupIndependentVoice(voiceId: string, voice: SampleVoice) {
    if (voice.cleanedUp) return
    voice.cleanedUp = true
    voice.source.disconnect()
    voice.gain.disconnect()
    this.independentVoices.delete(voiceId)
  }

  private createLoopSafeBuffer(buffer: AudioBuffer, region: PlaybackRegion) {
    const valid = validateLoopRegion(region.loopStartSeconds, region.loopEndSeconds, region.startSeconds, region.endSeconds)
    if (!valid.ok) {
      this.playbackRegion = { ...region, loopEnabled: false }
      return buffer
    }
    const processed = this.context.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate)
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      processed.getChannelData(channel).set(applyLoopEdgeFades(
        buffer.getChannelData(channel),
        buffer.sampleRate,
        region.loopStartSeconds,
        region.loopEndSeconds,
        region.loopCrossfadeSeconds,
      ))
    }
    return processed
  }
}
