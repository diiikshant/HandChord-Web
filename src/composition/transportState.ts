import type { TransportState } from './compositionTypes.ts'

const TRANSITIONS: Record<TransportState, readonly TransportState[]> = {
  idle: ['armed', 'loopReady', 'error'],
  armed: ['countingIn', 'recording', 'idle', 'error'],
  countingIn: ['recording', 'idle', 'error'],
  recording: ['processing', 'idle', 'error'],
  processing: ['loopReady', 'error'],
  loopReady: ['armed', 'playing', 'idle', 'error'],
  playing: ['stopped', 'armed', 'idle', 'error'],
  stopped: ['playing', 'armed', 'loopReady', 'idle', 'error'],
  error: ['idle', 'armed', 'loopReady'],
}

export function canTransition(from: TransportState, to: TransportState) {
  return TRANSITIONS[from].includes(to)
}

export function requireTransition(from: TransportState, to: TransportState) {
  if (!canTransition(from, to)) throw new Error(`Cannot move transport from ${from} to ${to}.`)
  return to
}
