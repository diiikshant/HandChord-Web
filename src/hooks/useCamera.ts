import { useCallback, useEffect, useRef, useState } from 'react'
import { getCameraErrorStatus, type CameraStatus } from './cameraState'

function stopMediaTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop())
}

export function useCamera() {
  const [status, setStatus] = useState<CameraStatus>('idle')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const isMountedRef = useRef(true)

  const stopCamera = useCallback(() => {
    // Cleanup releases the physical webcam and turns off its browser indicator.
    stopMediaTracks(streamRef.current)
    streamRef.current = null
    setStream(null)
    setStatus('idle')
  }, [])

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unavailable')
      return
    }

    stopMediaTracks(streamRef.current)
    streamRef.current = null
    setStream(null)
    setStatus('requesting')

    try {
      // Ask only after the button click, and request video without a microphone.
      const nextStream = await navigator.mediaDevices.getUserMedia({
        // Prefer the front camera when the device offers more than one camera.
        video: { facingMode: { ideal: 'user' } },
        audio: false,
      })

      if (!isMountedRef.current) {
        stopMediaTracks(nextStream)
        return
      }

      streamRef.current = nextStream
      setStream(nextStream)
      setStatus('active')
    } catch (error) {
      if (isMountedRef.current) {
        setStatus(getCameraErrorStatus(error))
      }
    }
  }, [])

  useEffect(() => {
    const stopWhenLeavingPage = () => stopCamera()

    window.addEventListener('pagehide', stopWhenLeavingPage)

    return () => {
      isMountedRef.current = false
      window.removeEventListener('pagehide', stopWhenLeavingPage)
      // Also clean up if this camera experience is removed from the page.
      stopMediaTracks(streamRef.current)
      streamRef.current = null
    }
  }, [stopCamera])

  return { startCamera, status, stopCamera, stream }
}
