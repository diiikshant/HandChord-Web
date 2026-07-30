export type CameraStatus =
  | 'idle'
  | 'requesting'
  | 'active'
  | 'denied'
  | 'unavailable'
  | 'error'

export function getCameraErrorStatus(error: unknown): CameraStatus {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return 'denied'
    }

    if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') {
      return 'unavailable'
    }
  }

  return 'error'
}
