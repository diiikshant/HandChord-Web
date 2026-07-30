import { useEffect, useRef, useState } from 'react'
import type { AudioEngine } from '../audio/AudioEngine.ts'
import { CompositionTransport } from '../composition/CompositionTransport.ts'
import type { CompositionTransportSnapshot } from '../composition/compositionTypes.ts'

const INITIAL: CompositionTransportSnapshot = {
  state: 'idle', settings: { bpm: 100, barCount: 4, countInBars: 1, metronomeEnabled: true, metronomeGain: 0.18 },
  composition: null, error: null, warning: null, schedule: null, currentBar: 1, currentBeat: 1,
  remainingCountInBars: 0, loopCycleCount: 0, playbackActive: false, workletStatus: 'idle', recordingTapActive: false, receivedFrameCount: 0,
  undoAction: null, sourceGroupSize: 0, sharedPlaybackStartTime: null, compositionBusActive: false,
  audibleLayerIds: [], mutedLayerIds: [], soloedLayerIds: [], runtimeBufferIds: [], pendingSilentLayerId: null,
}

/** Keeps composition transport decisions outside React and uses animation frames only for display refreshes. */
export function useCompositionLoop(engine: AudioEngine) {
  const transportRef = useRef<CompositionTransport | null>(null)
  const [snapshot, setSnapshot] = useState<CompositionTransportSnapshot>(INITIAL)
  if (!transportRef.current) transportRef.current = new CompositionTransport(engine)
  const transport = transportRef.current

  useEffect(() => {
    const unsubscribe = transport.subscribe(setSnapshot)
    let animationFrame = 0
    const updateDisplay = () => { setSnapshot(transport.getSnapshot()); animationFrame = window.requestAnimationFrame(updateDisplay) }
    animationFrame = window.requestAnimationFrame(updateDisplay)
    return () => { unsubscribe(); window.cancelAnimationFrame(animationFrame); transport.dispose() }
  }, [transport])

  return { transport, composition: snapshot }
}
