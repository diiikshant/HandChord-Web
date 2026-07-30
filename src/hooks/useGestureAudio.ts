import { useCallback, useEffect, useRef, useState } from 'react'
import type { AudioEngine } from '../audio/AudioEngine.ts'
import { GestureAudioController, type GestureAudioSnapshot } from '../gestureAudio/GestureAudioController.ts'
import type { StableHandRecognition } from '../gestures/fingerState.ts'
import type { RootKey, ScaleName } from '../music/MusicTheoryEngine.ts'

type GestureAudioInputs = {
  engine: AudioEngine
  recognitions: StableHandRecognition[]
  liveHandCount: number
  root: RootKey
  scale: ScaleName
}

const INITIAL_GESTURE_AUDIO: GestureAudioSnapshot = {
  enabled: false,
  state: 'waiting',
  leftGesture: null,
  rightGesture: null,
  bank: null,
  chord: null,
  reason: 'Gesture Audio is off',
}

function snapshotsMatch(a: GestureAudioSnapshot, b: GestureAudioSnapshot) {
  return (
    a.enabled === b.enabled &&
    a.state === b.state &&
    a.leftGesture === b.leftGesture &&
    a.rightGesture === b.rightGesture &&
    a.bank === b.bank &&
    a.chord?.name === b.chord?.name &&
    a.reason === b.reason
  )
}

/** Runs gesture-to-audio decisions outside the MediaPipe rendering loop. */
export function useGestureAudio({ engine, recognitions, liveHandCount, root, scale }: GestureAudioInputs) {
  const controllerRef = useRef<GestureAudioController | null>(null)
  const inputsRef = useRef({ recognitions, liveHandCount, root, scale })
  const [snapshot, setSnapshot] = useState<GestureAudioSnapshot>(INITIAL_GESTURE_AUDIO)

  if (!controllerRef.current) {
    controllerRef.current = new GestureAudioController(engine)
  }
  const controller = controllerRef.current
  inputsRef.current = { recognitions, liveHandCount, root, scale }

  const publish = useCallback((next: GestureAudioSnapshot) => {
    setSnapshot((current) => (snapshotsMatch(current, next) ? current : next))
  }, [])

  const process = useCallback(() => {
    const current = inputsRef.current
    publish(controller.process(current.recognitions, current.root, current.scale, performance.now(), current.liveHandCount))
  }, [controller, publish])

  useEffect(() => {
    process()
  }, [recognitions, liveHandCount, root, scale, process])

  useEffect(() => {
    const timer = window.setInterval(process, 100)
    return () => window.clearInterval(timer)
  }, [process])

  useEffect(() => () => {
    controller.setEnabled(false)
  }, [controller])

  const setEnabled = useCallback((enabled: boolean) => {
    publish(controller.setEnabled(enabled))
  }, [controller, publish])

  const releaseOwnership = useCallback(() => {
    publish(controller.releaseOwnership())
  }, [controller, publish])

  return { gestureAudio: snapshot, setGestureAudioEnabled: setEnabled, releaseGestureAudioOwnership: releaseOwnership }
}
