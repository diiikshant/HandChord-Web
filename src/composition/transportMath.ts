import type { CompositionSettings, CountInBars, LoopBars, TransportSchedule } from './compositionTypes.ts'

export const MIN_BPM = 40
export const MAX_BPM = 220
export const BEATS_PER_BAR = 4
export const DEFAULT_BOUNDARY_CROSSFADE_SECONDS = 0.01

export function validateTempo(bpm: number) {
  return Number.isFinite(bpm) && bpm >= MIN_BPM && bpm <= MAX_BPM
}

export function validateBarCount(barCount: number): barCount is LoopBars {
  return barCount === 1 || barCount === 2 || barCount === 4 || barCount === 8
}

export function validateCountInBars(countInBars: number): countInBars is CountInBars {
  return countInBars === 0 || countInBars === 1 || countInBars === 2
}

export function secondsPerBeat(bpm: number) {
  if (!validateTempo(bpm)) throw new Error(`Tempo must be between ${MIN_BPM} and ${MAX_BPM} BPM.`)
  return 60 / bpm
}

export function secondsPerBar(bpm: number) {
  return secondsPerBeat(bpm) * BEATS_PER_BAR
}

export function loopDurationSeconds(bpm: number, barCount: LoopBars) {
  if (!validateBarCount(barCount)) throw new Error('Choose a loop length of 1, 2, 4, or 8 bars.')
  return secondsPerBar(bpm) * barCount
}

/** Builds the single AudioContext-clock schedule used by metronome and PCM capture. */
export function createTransportSchedule(
  settings: Pick<CompositionSettings, 'bpm' | 'barCount' | 'countInBars'>,
  sampleRate: number,
  now: number,
  lookaheadSeconds = 0.06,
): TransportSchedule {
  if (!validateTempo(settings.bpm)) throw new Error(`Tempo must be between ${MIN_BPM} and ${MAX_BPM} BPM.`)
  if (!validateBarCount(settings.barCount)) throw new Error('Choose a loop length of 1, 2, 4, or 8 bars.')
  if (!validateCountInBars(settings.countInBars)) throw new Error('Choose count-in Off, 1 bar, or 2 bars.')
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error('The audio output has no usable sample rate.')

  const perBeat = secondsPerBeat(settings.bpm)
  const perBar = perBeat * BEATS_PER_BAR
  const countInStartTime = now + lookaheadSeconds
  const recordingStartTime = countInStartTime + perBar * settings.countInBars
  const duration = perBar * settings.barCount
  const startFrame = Math.round(recordingStartTime * sampleRate)
  const expectedFrameCount = Math.round(duration * sampleRate)
  return {
    secondsPerBeat: perBeat,
    secondsPerBar: perBar,
    loopDurationSeconds: duration,
    countInDurationSeconds: perBar * settings.countInBars,
    countInStartTime,
    recordingStartTime,
    recordingEndTime: recordingStartTime + duration,
    startFrame,
    endFrame: startFrame + expectedFrameCount,
    expectedFrameCount,
  }
}

export function clampBoundaryCrossfade(requestedSeconds: number, loopDuration: number) {
  if (!Number.isFinite(requestedSeconds) || !Number.isFinite(loopDuration) || loopDuration <= 0) return 0
  return Math.max(0, Math.min(requestedSeconds, 0.02, loopDuration / 8))
}

/** Makes only the final few milliseconds blend into the loop beginning. Length never changes. */
export function applyLoopBoundaryCrossfade(buffer: AudioBuffer, crossfadeSeconds: number) {
  const frames = Math.floor(clampBoundaryCrossfade(crossfadeSeconds, buffer.duration) * buffer.sampleRate)
  if (frames < 2) return buffer
  const output = new Float32Array(buffer.length)
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const source = buffer.getChannelData(channel)
    output.set(source)
    for (let frame = 0; frame < frames; frame += 1) {
      const progress = (frame + 1) / (frames + 1)
      const dryWeight = Math.cos(progress * Math.PI * 0.5)
      const wrapWeight = Math.sin(progress * Math.PI * 0.5)
      output[buffer.length - frames + frame] = source[buffer.length - frames + frame] * dryWeight + source[frame] * wrapWeight
    }
    buffer.getChannelData(channel).set(output)
  }
  return buffer
}
