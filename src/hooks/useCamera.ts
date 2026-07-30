import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { CameraLifecycle, type StopReason } from './cameraLifecycle'
import { getCameraErrorStatus, type CameraStatus } from './cameraState'

const METADATA_TIMEOUT_MS = 5000

function logCamera(event: string, details: Record<string, unknown> = {}) {
  console.info(`[HandChord camera] ${event}`, details)
}

function getVideoTrack(stream: MediaStream) {
  return stream.getVideoTracks()[0] ?? null
}

function clearVideoStream(video: HTMLVideoElement | null, stream: MediaStream) {
  if (video?.srcObject === stream) {
    video.pause()
    video.srcObject = null
    logCamera('srcObject cleared', { streamId: stream.id })
  }
}

function waitForLoadedMetadata(video: HTMLVideoElement, streamId: string) {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
    logCamera('loadedmetadata already available', { streamId })
    return Promise.resolve()
  }

  return new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup()
      logCamera('loadedmetadata timeout', { streamId })
      reject(new Error('Camera metadata did not arrive in time.'))
    }, METADATA_TIMEOUT_MS)

    const onLoadedMetadata = () => {
      cleanup()
      logCamera('loadedmetadata fired', { streamId })
      resolve()
    }
    const onVideoError = () => {
      cleanup()
      reject(new Error('The video element reported an error while starting.'))
    }
    const cleanup = () => {
      window.clearTimeout(timeoutId)
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('error', onVideoError)
    }

    video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true })
    video.addEventListener('error', onVideoError, { once: true })
  })
}

export function useCamera(videoRef: RefObject<HTMLVideoElement | null>) {
  const [status, setStatus] = useState<CameraStatus>('idle')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const lifecycleRef = useRef<CameraLifecycle | null>(null)
  const removeTrackDiagnosticsRef = useRef<(() => void) | null>(null)

  if (!lifecycleRef.current) {
    lifecycleRef.current = new CameraLifecycle((stoppedStream, reason) => {
      logCamera('stopping stream tracks', { reason, streamId: stoppedStream.id })
    })
  }

  const removeTrackDiagnostics = useCallback(() => {
    removeTrackDiagnosticsRef.current?.()
    removeTrackDiagnosticsRef.current = null
  }, [])

  const stopCamera = useCallback(
    (reason: StopReason = 'user requested stop') => {
      const lifecycle = lifecycleRef.current
      if (!lifecycle) {
        return
      }

      logCamera('stopCamera called', { reason })
      const stoppedStream = lifecycle.stopActive(reason)
      removeTrackDiagnostics()
      if (stoppedStream) {
        clearVideoStream(videoRef.current, stoppedStream)
      }
      setStream(null)
      setStatus('idle')
    },
    [removeTrackDiagnostics, videoRef],
  )

  const startCamera = useCallback(async () => {
    const lifecycle = lifecycleRef.current
    if (!lifecycle) {
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unavailable')
      return
    }

    const generation = lifecycle.beginRequest()
    if (generation === null) {
      logCamera('getUserMedia request ignored', { reason: 'another request or stream is already active' })
      return
    }

    setStatus('requesting')
    logCamera('getUserMedia request started', { generation })

    let nextStream: MediaStream | null = null
    try {
      nextStream = await navigator.mediaDevices.getUserMedia({
        // Prefer the front camera when the device offers more than one camera.
        video: { facingMode: { ideal: 'user' } },
        audio: false,
      })
      const videoTrack = getVideoTrack(nextStream)

      logCamera('getUserMedia resolved', {
        generation,
        streamId: nextStream.id,
        videoTrackId: videoTrack?.id,
        trackReadyState: videoTrack?.readyState,
        trackEnabled: videoTrack?.enabled,
        trackMuted: videoTrack?.muted,
        trackSettings: videoTrack?.getSettings(),
      })

      if (!videoTrack || videoTrack.readyState === 'ended') {
        lifecycle.rejectRequest(generation)
        const failedStream = nextStream
        nextStream = null
        clearVideoStream(videoRef.current, failedStream)
        lifecycle.discardStream(failedStream, 'camera startup failed')
        setStatus('unavailable')
        return
      }

      if (!lifecycle.acceptStream(generation, nextStream)) {
        return
      }

      const video = videoRef.current
      if (!video) {
        lifecycle.stopOwnedStream(generation, nextStream, 'camera startup failed')
        setStatus('error')
        return
      }

      const trackDiagnosticListeners = [
        ['mute', () => logCamera('track mute event', { generation, trackId: videoTrack.id })],
        ['unmute', () => logCamera('track unmute event', { generation, trackId: videoTrack.id })],
        ['ended', () => logCamera('track ended event', { generation, trackId: videoTrack.id })],
      ] as const
      trackDiagnosticListeners.forEach(([event, listener]) => videoTrack.addEventListener(event, listener))
      removeTrackDiagnosticsRef.current = () => {
        trackDiagnosticListeners.forEach(([event, listener]) => videoTrack.removeEventListener(event, listener))
      }

      video.muted = true
      video.playsInline = true
      video.srcObject = nextStream
      logCamera('srcObject assigned', { generation, streamId: nextStream.id })

      await waitForLoadedMetadata(video, nextStream.id)
      if (!lifecycle.ownsStream(generation, nextStream)) {
        return
      }

      try {
        await video.play()
        logCamera('video.play resolved', { generation, streamId: nextStream.id })
      } catch (error) {
        logCamera('video.play rejected', { generation, streamId: nextStream.id, error: String(error) })
        throw error
      }

      if (!lifecycle.ownsStream(generation, nextStream)) {
        return
      }

      // Mark active only after the stable video element is actually playing.
      setStream(nextStream)
      setStatus('active')
    } catch (error) {
      const requestWasCurrent =
        (nextStream !== null && lifecycle.ownsStream(generation, nextStream)) ||
        lifecycle.isPendingRequest(generation)

      if (nextStream) {
        const stopped = lifecycle.stopOwnedStream(generation, nextStream, 'camera startup failed')
        if (stopped) {
          removeTrackDiagnostics()
          clearVideoStream(videoRef.current, nextStream)
          setStream(null)
        }
      } else {
        lifecycle.rejectRequest(generation)
      }

      if (requestWasCurrent && !lifecycle.getActiveStream()) {
        setStatus(getCameraErrorStatus(error))
      }
    }
  }, [removeTrackDiagnostics, videoRef])

  useEffect(() => {
    const lifecycle = lifecycleRef.current
    lifecycle?.mount()
    logCamera('camera component mounted')

    return () => {
      logCamera('camera component unmounted')
      removeTrackDiagnostics()
      const stoppedStream = lifecycle?.getActiveStream() ?? null
      lifecycle?.unmount()
      if (stoppedStream) {
        clearVideoStream(videoRef.current, stoppedStream)
      }
    }
  }, [removeTrackDiagnostics, videoRef])

  return { startCamera, status, stopCamera, stream }
}
