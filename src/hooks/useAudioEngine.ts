import { useEffect, useRef, useState } from 'react'
import { AudioEngine, type AudioSnapshot } from '../audio/AudioEngine.ts'

const INITIAL_AUDIO: AudioSnapshot = {
  status: 'disabled',
  contextState: 'not-created',
  activeChordId: null,
  error: null,
}

/** Shares one lazily activated AudioEngine between button and gesture controls. */
export function useAudioEngine() {
  const engineRef = useRef<AudioEngine | null>(null)
  const [audio, setAudio] = useState<AudioSnapshot>(INITIAL_AUDIO)

  if (!engineRef.current) {
    // This creates only a service object. AudioContext creation still waits for Enable Audio.
    engineRef.current = new AudioEngine()
  }

  const engine = engineRef.current
  useEffect(() => {
    const unsubscribe = engine.subscribe(setAudio)
    return () => {
      unsubscribe()
      engine.dispose()
    }
  }, [engine])

  return { engine, audio }
}
