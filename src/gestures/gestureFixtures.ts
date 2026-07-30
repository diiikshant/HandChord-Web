import type { FingerName } from './fingerState.ts'
import type { TrackedHand } from '../tracking/handTrackingTypes.ts'

type PoseOptions = {
  extended?: FingerName[]
  handedness?: 'Left' | 'Right'
  confidence?: number
  rotationRadians?: number
  lowVisibility?: number[]
  occludedTips?: number[]
}

type Point = { x: number; y: number; z: number; visibility: number }

function rotate(point: Point, radians: number): Point {
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  return {
    ...point,
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  }
}

function point(x: number, y: number): Point {
  return { x, y, z: 0, visibility: 1 }
}

function setLongFinger(points: Point[], indices: [number, number, number, number], x: number, extended: boolean) {
  const [mcp, pip, dip, tip] = indices
  points[mcp] = point(x, 1)
  points[pip] = point(x, extended ? 1.65 : 1.55)
  points[dip] = point(x, extended ? 2.3 : 1.02)
  points[tip] = point(x, extended ? 3 : 0.65)
}

export function createHandPose(options: PoseOptions = {}): TrackedHand {
  const extended = new Set(options.extended || [])
  const handedness = options.handedness || 'Right'
  const mirror = handedness === 'Left' ? -1 : 1
  const points = Array.from({ length: 21 }, () => point(0, 0))
  points[0] = point(0, 0)

  const thumbExtended = extended.has('thumb')
  points[1] = point(0.48 * mirror, 0.32)
  points[2] = point(0.8 * mirror, 0.52)
  points[3] = point((thumbExtended ? 1.38 : 0.68) * mirror, thumbExtended ? 0.68 : 0.26)
  points[4] = point((thumbExtended ? 1.95 : 0.42) * mirror, thumbExtended ? 0.72 : 0.18)

  setLongFinger(points, [5, 6, 7, 8], 0.6 * mirror, extended.has('index'))
  setLongFinger(points, [9, 10, 11, 12], 0.12 * mirror, extended.has('middle'))
  setLongFinger(points, [13, 14, 15, 16], -0.38 * mirror, extended.has('ring'))
  setLongFinger(points, [17, 18, 19, 20], -0.86 * mirror, extended.has('little'))

  const rotation = options.rotationRadians || 0
  const lowVisibility = new Set(options.lowVisibility || [])
  const occludedTips = new Set(options.occludedTips || [])

  return {
    landmarks: points.map((landmark, index) => ({
      ...rotate(landmark, rotation),
      visibility: lowVisibility.has(index) || occludedTips.has(index) ? 0.2 : 1,
    })),
    handedness,
    confidence: options.confidence ?? 0.98,
  }
}
