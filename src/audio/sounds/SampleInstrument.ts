import { applyLoopEdgeFades, resolvePlaybackRegion, safeFadeDuration, samplePlaybackRate, sampleVoiceNotes, validateLoopRegion, type PlaybackRegion } from './sampleMath.ts'
import type { PersonalSound } from './soundTypes.ts'

type SampleVoice = { source: AudioBufferSourceNode; gain: GainNode; releaseSeconds: number; looping: boolean; released: boolean }

/** Creates one-use AudioBufferSourceNode voices while sharing the existing effects output. */
export class SampleInstrument {
  private readonly context: AudioContext
  private readonly output: AudioNode
  private readonly voices = new Map<string, SampleVoice>()
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
  get activeVoiceCount() { return this.voices.size }
  get playbackRates() { return this.lastPlaybackRates }

  playChord(chordId: string, midiNotes: number[]) {
    if (!this.sound || !this.buffer) throw new Error('The selected personal sound has no decoded audio data.')
    this.releaseAll()
    this.lastPlaybackRates = []
    const notes = sampleVoiceNotes(this.sound, midiNotes)
    notes.forEach((note, index) => this.startVoice(`${chordId}-${index}`, note))
  }

  preview(sound: PersonalSound, buffer: AudioBuffer) {
    this.releaseAll()
    this.lastPlaybackRates = []
    // Preview always ends after the selected region so it cannot leave a loop running.
    const previewSound = { ...sound, loopEnabled: false }
    this.startVoice('preview', previewSound.rootMidiNote, previewSound, buffer, resolvePlaybackRegion(previewSound, buffer.duration))
  }

  releaseAll() {
    const now = this.context.currentTime
    this.voices.forEach((voice) => this.releaseVoice(voice, now))
    this.voices.clear()
  }

  dispose() { this.releaseAll(); this.clearSound() }

  private startVoice(id: string, note: number, configuredSound = this.sound, configuredBuffer = this.buffer, configuredRegion = this.playbackRegion) {
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
    const releaseSeconds = Math.max(0.03, safeFadeDuration(sound.fadeOutSeconds, duration))
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
    source.onended = () => { source.disconnect(); gain.disconnect(); this.voices.delete(voiceId) }
    source.start(now, region.startSeconds, source.loop ? undefined : duration)
    this.lastPlaybackRates.push(rate)
    this.voices.set(voiceId, { source, gain, releaseSeconds, looping: source.loop, released: false })
  }

  private releaseVoice(voice: SampleVoice, now: number) {
    if (voice.released) return
    voice.released = true
    voice.gain.gain.cancelScheduledValues(now)
    voice.gain.gain.setValueAtTime(Math.max(voice.gain.gain.value, 0.0001), now)
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + voice.releaseSeconds)
    try { voice.source.stop(now + voice.releaseSeconds + 0.02) } catch { /* An already-ended one-use source is safe to ignore. */ }
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
