import { useEffect, useRef, useState } from 'react'
import { recogniseHand } from '../gestures/fingerClassifier'
import { GestureStabiliser } from '../gestures/gestureStabiliser'
import type { HandRecognition, StableHandRecognition } from '../gestures/fingerState'
import type { TrackedHand } from '../tracking/handTrackingTypes'

export function useFingerRecognition(hands: TrackedHand[]) {
  const [recognitions, setRecognitions] = useState<StableHandRecognition[]>([])
  const stabilisersRef = useRef(new Map<string, GestureStabiliser>())
  const lastRecognitionRef = useRef(new Map<string, HandRecognition>())

  useEffect(() => {
    const timestamp = performance.now()
    const currentKeys = new Set<string>()
    const nextRecognitions = hands.map((hand, index) => {
      const recognition = recogniseHand(hand)
      const key = recognition.role === 'unresolved' ? `unresolved-${index}` : recognition.role
      currentKeys.add(key)
      lastRecognitionRef.current.set(key, recognition)
      let stabiliser = stabilisersRef.current.get(key)
      if (!stabiliser) {
        stabiliser = new GestureStabiliser()
        stabilisersRef.current.set(key, stabiliser)
      }
      return stabiliser.update(recognition, timestamp)
    })

    lastRecognitionRef.current.forEach((previousRecognition, key) => {
      if (currentKeys.has(key)) {
        return
      }

      const stabiliser = stabilisersRef.current.get(key)
      if (!stabiliser) {
        return
      }
      nextRecognitions.push(
        stabiliser.update(
          {
            ...previousRecognition,
            rawExtendedCount: null,
            canonicalGesture: null,
            reason: 'hand temporarily missing',
          },
          timestamp,
        ),
      )
    })

    setRecognitions(nextRecognitions)
  }, [hands])

  return recognitions
}
