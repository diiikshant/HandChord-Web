export type ModelStatus = 'loading' | 'ready' | 'error'

export type TrackingStatus =
  | 'idle'
  | 'waiting-for-video'
  | 'no-hands'
  | 'one-hand'
  | 'two-hands'
  | 'error'

export type HandLandmark = {
  x: number
  y: number
  z: number
  visibility?: number
}

export type TrackedHand = {
  landmarks: HandLandmark[]
  handedness: string
  confidence: number
}

export type VideoDimensions = {
  width: number
  height: number
}

export type CanvasDimensions = VideoDimensions & {
  pixelRatio: number
}
