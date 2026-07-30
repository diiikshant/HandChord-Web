import { useCallback, useState } from 'react'
import type { AudioEngine } from '../audio/AudioEngine.ts'
import { validateDuration } from '../audio/sounds/sampleMath.ts'
import { detectSilenceBoundaries, MAX_RECORDING_SECONDS, remainingRecordingSeconds, type SilenceSuggestion } from '../recording/recordingMath.ts'
import { type CompletedRecording } from '../recording/MicrophoneRecorder.ts'
import { useMicrophoneRecording } from '../hooks/useMicrophoneRecording.ts'

export type RecordedSample = {
  buffer: AudioBuffer
  audioData: ArrayBuffer
  mimeType: string
  durationSeconds: number
  silence: SilenceSuggestion
}

type Props = {
  engine: AudioEngine
  onUseRecording: (recording: RecordedSample) => void
  onCancel: () => void
}

function timeLabel(seconds: number) { return `${seconds.toFixed(1)} s` }

/** Presents microphone capture while the recorder service owns only the microphone stream. */
export function RecordingPanel({ engine, onUseRecording, onCancel }: Props) {
  const [pending, setPending] = useState<RecordedSample | null>(null)
  const [processingError, setProcessingError] = useState<string | null>(null)
  const completeRecording = useCallback(async ({ blob, mimeType }: CompletedRecording) => {
    const audioData = await blob.arrayBuffer()
    const buffer = await engine.decodeAudioData(audioData)
    const validDuration = validateDuration(buffer.duration)
    if (!validDuration.ok) throw new Error(validDuration.reason)
    setPending({ buffer, audioData, mimeType, durationSeconds: buffer.duration, silence: detectSilenceBoundaries(buffer) })
  }, [engine])
  const { recording, beginRecording, stopRecording, cancelRecording } = useMicrophoneRecording(completeRecording, (stream) => engine.createInputLevelMeter(stream))

  const start = async () => {
    setProcessingError(null)
    try {
      // This user click may create/resume the shared AudioContext before the recording is decoded.
      await engine.enable()
      await beginRecording()
    } catch (error) {
      setProcessingError(error instanceof Error ? error.message : 'The microphone could not start.')
    }
  }
  const cancel = () => { cancelRecording(); setPending(null); onCancel() }
  const recordAgain = () => { cancelRecording(); setPending(null); void start() }

  if (pending) {
    return <section className="reverb-panel" aria-labelledby="recording-title">
      <div className="gesture-audio-heading"><div><p className="eyebrow">Microphone recording</p><h2 id="recording-title">Recording ready</h2></div><span className="tracking-status tracking-one-hand">Stopped</span></div>
      <p className="gesture-audio-message">{timeLabel(pending.durationSeconds)} captured as {pending.mimeType || 'browser audio'}.</p>
      {pending.silence.nearlySilent
        ? <p className="audio-error">This recording is nearly silent. You can record again; normalisation will remain off by default.</p>
        : <p className="gesture-audio-message">Suggested silence trim: {pending.silence.trimStartSeconds.toFixed(2)}–{pending.silence.trimEndSeconds.toFixed(2)} s. You can adjust it in the editor.</p>}
      <div className="audio-actions"><button className="secondary-button" type="button" onClick={recordAgain}>Record Again</button><button className="primary-button" type="button" onClick={() => onUseRecording(pending)}>Use Recording</button><button className="secondary-button" type="button" onClick={cancel}>Cancel</button></div>
    </section>
  }

  const recoverable = recording.phase === 'permission-denied' || recording.phase === 'microphone-unavailable' || recording.phase === 'microphone-busy' || recording.phase === 'recording-error'
  const remaining = remainingRecordingSeconds(recording.elapsedSeconds)
  return <section className="reverb-panel" aria-labelledby="recording-title">
    <div className="gesture-audio-heading"><div><p className="eyebrow">Local-only microphone</p><h2 id="recording-title">Record Sound</h2></div><button className="secondary-button" type="button" onClick={cancel}>Cancel</button></div>
    <p className="gesture-audio-message">Microphone permission is needed only when you select Start Recording. Audio stays on this device and is never uploaded. The camera is not requested or changed.</p>
    {(recording.error || processingError) && <p className="audio-error">{recording.error ?? processingError}</p>}
    <dl className="effect-readout" aria-label="Recording diagnostics">
      <div><dt>Recorder state</dt><dd>{recording.phase.replaceAll('-', ' ')}</dd></div>
      <div><dt>Format</dt><dd>{recording.mimeType ?? 'Not selected'}</dd></div>
      <div><dt>Microphone track</dt><dd>{recording.trackReadyState}</dd></div>
      <div><dt>Recorded size</dt><dd>{recording.blobSize ? `${Math.ceil(recording.blobSize / 1024)} KB` : '—'}</dd></div>
      <div><dt>Maximum duration</dt><dd>{MAX_RECORDING_SECONDS} s</dd></div>
    </dl>
    {recording.phase === 'countdown' && <div className="recording-countdown" aria-live="assertive"><strong>{recording.countdown}</strong><span>Get ready to record</span><button className="secondary-button" type="button" onClick={cancel}>Cancel countdown</button></div>}
    {recording.phase === 'recording' && <div className="recording-live" aria-live="polite"><div><strong>● Recording</strong><span>{timeLabel(recording.elapsedSeconds)} elapsed · {timeLabel(remaining)} remaining</span></div><div className="input-meter"><span>Input level</span><div className="input-meter-track"><i style={{ width: `${Math.round(recording.inputLevel * 100)}%` }} /></div></div><div className="audio-actions"><button className="primary-button" type="button" onClick={stopRecording}>Stop Recording</button><button className="secondary-button" type="button" onClick={cancel}>Cancel</button></div></div>}
    {recording.phase === 'processing-recording' && <p className="gesture-audio-message">Processing the recording locally…</p>}
    {recording.phase !== 'countdown' && recording.phase !== 'recording' && recording.phase !== 'processing-recording' && <div className="audio-actions"><button className="primary-button" type="button" onClick={() => void start()}>{recoverable ? 'Try Again' : 'Start Recording'}</button></div>}
  </section>
}
