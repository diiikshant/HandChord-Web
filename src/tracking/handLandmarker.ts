import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'

const WASM_PATH = '/mediapipe/wasm'
const MODEL_PATH = '/models/hand_landmarker.task'

export async function createHandLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(WASM_PATH)

  return HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_PATH },
    runningMode: 'VIDEO',
    numHands: 2,
  })
}
