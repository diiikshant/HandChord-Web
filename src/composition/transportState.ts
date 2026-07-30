import type { TransportState } from './compositionTypes.ts'

const TRANSITIONS: Record<TransportState, readonly TransportState[]> = {
  idle: ['armed', 'error'],
  armed: ['countingIn', 'recordingLayer', 'idle', 'error'],
  countingIn: ['recordingLayer', 'idle', 'error'],
  recordingLayer: ['processingLayer', 'idle', 'error'],
  processingLayer: ['compositionReady', 'error'],
  compositionReady: ['armed', 'replacingLayer', 'playing', 'idle', 'error'],
  playing: ['stopped', 'armed', 'replacingLayer', 'idle', 'error'],
  stopped: ['playing', 'armed', 'replacingLayer', 'compositionReady', 'idle', 'error'],
  replacingLayer: ['countingIn', 'recordingLayer', 'compositionReady', 'error'],
  error: ['idle', 'armed', 'compositionReady'],
}

export function canTransition(from: TransportState, to: TransportState) {
  return TRANSITIONS[from].includes(to)
}

export function requireTransition(from: TransportState, to: TransportState) {
  if (!canTransition(from, to)) throw new Error(`Cannot move transport from ${from} to ${to}.`)
  return to
}
