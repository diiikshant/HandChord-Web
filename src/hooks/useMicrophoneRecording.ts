import { useEffect, useRef, useState } from 'react'
import { MicrophoneRecorder, type CompletedRecording, type InputMeter, type RecordingSnapshot } from '../recording/MicrophoneRecorder.ts'

const INITIAL: RecordingSnapshot = { phase: 'not-requested', countdown: null, elapsedSeconds: 0, inputLevel: 0, mimeType: null, trackReadyState: 'not-created', blobSize: 0, error: null }

/** Keeps microphone capture separate from camera and sample playback ownership. */
export function useMicrophoneRecording(
  onComplete: (recording: CompletedRecording) => Promise<void> | void,
  createInputMeter: (stream: MediaStream) => InputMeter,
) {
  const completeRef = useRef(onComplete)
  const meterRef = useRef(createInputMeter)
  const recorderRef = useRef<MicrophoneRecorder | null>(null)
  const [recording, setRecording] = useState<RecordingSnapshot>(INITIAL)
  completeRef.current = onComplete
  meterRef.current = createInputMeter
  if (!recorderRef.current) recorderRef.current = new MicrophoneRecorder({ onSnapshot: setRecording, onComplete: (result) => completeRef.current(result), createInputMeter: (stream) => meterRef.current(stream) })
  const recorder = recorderRef.current
  useEffect(() => () => recorder.dispose(), [recorder])
  useEffect(() => {
    const cancelWhenHidden = () => { if (document.hidden) recorder.cancel() }
    document.addEventListener('visibilitychange', cancelWhenHidden)
    return () => document.removeEventListener('visibilitychange', cancelWhenHidden)
  }, [recorder])
  return { recording, beginRecording: () => recorder.begin(), stopRecording: () => recorder.stop(), cancelRecording: () => recorder.cancel() }
}
