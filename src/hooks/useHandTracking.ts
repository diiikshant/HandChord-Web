import { useEffect, useRef, useState, type RefObject } from 'react'
import type { HandLandmarker } from '@mediapipe/tasks-vision'
import { createHandLandmarker } from '../tracking/handLandmarker'
import type {
  ModelStatus,
  TrackingStatus,
  TrackedHand,
  VideoDimensions,
} from '../tracking/handTrackingTypes'

const TARGET_FPS = 18
const FRAME_INTERVAL_MS = 1000 / TARGET_FPS

function toTrackedHands(result: ReturnType<HandLandmarker['detectForVideo']>): TrackedHand[] {
  return result.landmarks.slice(0, 2).map((landmarks, index) => {
    const category = result.handedness[index]?.[0]

    return {
      landmarks: landmarks.map(({ x, y, z }) => ({ x, y, z })),
      handedness: category?.categoryName || 'Unknown',
      confidence: category?.score || 0,
    }
  })
}

export function useHandTracking(
  videoRef: RefObject<HTMLVideoElement | null>,
  stream: MediaStream | null,
  isCameraActive: boolean,
) {
  const [modelStatus, setModelStatus] = useState<ModelStatus>('loading')
  const [trackingStatus, setTrackingStatus] = useState<TrackingStatus>('idle')
  const [hands, setHands] = useState<TrackedHand[]>([])
  const [inferenceFps, setInferenceFps] = useState(0)
  const [videoDimensions, setVideoDimensions] = useState<VideoDimensions>({ width: 0, height: 0 })
  const landmarkerRef = useRef<HandLandmarker | null>(null)

  useEffect(() => {
    let cancelled = false

    void createHandLandmarker()
      .then((landmarker) => {
        if (cancelled) {
          landmarker.close()
          return
        }

        landmarkerRef.current = landmarker
        setModelStatus('ready')
      })
      .catch(() => {
        if (!cancelled) {
          setModelStatus('error')
        }
      })

    return () => {
      cancelled = true
      landmarkerRef.current?.close()
      landmarkerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!stream) {
      return
    }

    const stopTracking = () => {
      setHands([])
      setInferenceFps(0)
      setTrackingStatus('idle')
    }
    const videoTracks = stream.getVideoTracks()

    videoTracks.forEach((track) => track.addEventListener('ended', stopTracking))

    return () => {
      videoTracks.forEach((track) => track.removeEventListener('ended', stopTracking))
    }
  }, [stream])

  useEffect(() => {
    const video = videoRef.current
    const landmarker = landmarkerRef.current

    if (!isCameraActive || !stream || !video || !landmarker || modelStatus !== 'ready') {
      if (!isCameraActive || !stream) {
        setHands([])
        setInferenceFps(0)
        setTrackingStatus('idle')
      }
      return
    }

    let animationFrameId = 0
    let stopped = false
    let processingFrame = false
    let lastVideoTime = -1
    let lastInferenceAt = 0
    let fpsWindowStartedAt = performance.now()
    let framesInWindow = 0

    const renderLoop = (now: number) => {
      if (stopped) {
        return
      }

      const activeVideoTrack = stream.getVideoTracks()[0]
      if (!activeVideoTrack || activeVideoTrack.readyState === 'ended') {
        setTrackingStatus('idle')
        return
      }

      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        setTrackingStatus('waiting-for-video')
        animationFrameId = requestAnimationFrame(renderLoop)
        return
      }

      // This keeps inference bounded: one synchronous frame at a time, with no queue.
      if (
        !processingFrame &&
        video.currentTime !== lastVideoTime &&
        now - lastInferenceAt >= FRAME_INTERVAL_MS
      ) {
        processingFrame = true

        try {
          const result = landmarker.detectForVideo(video, now)
          const nextHands = toTrackedHands(result)

          setHands(nextHands)
          setVideoDimensions({ width: video.videoWidth, height: video.videoHeight })
          setTrackingStatus(
            nextHands.length === 0
              ? 'no-hands'
              : nextHands.length === 1
                ? 'one-hand'
                : 'two-hands',
          )

          framesInWindow += 1
          const elapsed = now - fpsWindowStartedAt
          if (elapsed >= 500) {
            setInferenceFps(Math.round((framesInWindow * 1000) / elapsed))
            fpsWindowStartedAt = now
            framesInWindow = 0
          }

          lastVideoTime = video.currentTime
          lastInferenceAt = now
        } catch {
          setTrackingStatus('error')
          stopped = true
        } finally {
          processingFrame = false
        }
      }

      if (!stopped) {
        animationFrameId = requestAnimationFrame(renderLoop)
      }
    }

    animationFrameId = requestAnimationFrame(renderLoop)

    return () => {
      stopped = true
      cancelAnimationFrame(animationFrameId)
    }
  }, [isCameraActive, modelStatus, stream, videoRef])

  return { hands, inferenceFps, modelStatus, trackingStatus, videoDimensions }
}
