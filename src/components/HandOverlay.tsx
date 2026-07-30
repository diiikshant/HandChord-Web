import { useEffect, useLayoutEffect, useRef } from 'react'
import { HandLandmarker } from '@mediapipe/tasks-vision'
import { getContainRect, normalizedPointToCanvas } from '../tracking/overlayGeometry'
import type { CanvasDimensions, TrackedHand } from '../tracking/handTrackingTypes'

type HandOverlayProps = {
  hands: TrackedHand[]
  videoRef: React.RefObject<HTMLVideoElement | null>
  onCanvasDimensionsChange: (dimensions: CanvasDimensions) => void
}

const HAND_COLORS = ['#97f6c7', '#aeb5ff']

export function HandOverlay({ hands, videoRef, onCanvasDimensionsChange }: HandOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const resizeCanvas = () => {
      const { width, height } = canvas.getBoundingClientRect()
      const pixelRatio = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.round(width * pixelRatio))
      canvas.height = Math.max(1, Math.round(height * pixelRatio))
      onCanvasDimensionsChange({ width: Math.round(width), height: Math.round(height), pixelRatio })
    }

    resizeCanvas()
    const resizeObserver = new ResizeObserver(resizeCanvas)
    resizeObserver.observe(canvas)

    return () => resizeObserver.disconnect()
  }, [onCanvasDimensionsChange])

  useEffect(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) {
      return
    }

    const context = canvas.getContext('2d')
    if (!context) {
      return
    }

    const pixelRatio = window.devicePixelRatio || 1
    const { width: stageWidth, height: stageHeight } = canvas.getBoundingClientRect()
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    context.clearRect(0, 0, stageWidth, stageHeight)

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      return
    }

    const videoRect = getContainRect(
      { width: stageWidth, height: stageHeight },
      { width: video.videoWidth, height: video.videoHeight },
    )

    hands.forEach((hand, handIndex) => {
      const color = HAND_COLORS[handIndex] || HAND_COLORS[0]
      const points = hand.landmarks.map((landmark) =>
        // The video is mirrored with CSS; mirror drawing coordinates once to match it.
        normalizedPointToCanvas(landmark, videoRect, true),
      )

      context.strokeStyle = color
      context.fillStyle = color
      context.lineWidth = 1.5
      context.beginPath()
      // These are MediaPipe's official HandLandmarker connections, not custom indices.
      HandLandmarker.HAND_CONNECTIONS.forEach((connection) => {
        const start = points[connection.start]
        const end = points[connection.end]
        if (start && end) {
          context.moveTo(start.x, start.y)
          context.lineTo(end.x, end.y)
        }
      })
      context.stroke()

      points.forEach((point) => {
        context.beginPath()
        context.arc(point.x, point.y, 2.6, 0, Math.PI * 2)
        context.fill()
      })

      const labelPoint = points[0]
      if (labelPoint) {
        context.font = '600 13px system-ui, sans-serif'
        context.fillText(`${hand.handedness} ${(hand.confidence * 100).toFixed(0)}%`, labelPoint.x + 8, labelPoint.y - 8)
      }
    })
  }, [hands, videoRef])

  return <canvas ref={canvasRef} className="hand-overlay" aria-hidden="true" />
}
