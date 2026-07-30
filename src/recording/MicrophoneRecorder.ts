import { isRecordingSessionActive, MAX_RECORDING_SECONDS, nextRecordingPhase, selectRecordingMimeType, stopOwnedMediaTracks, type RecordingPhase } from './recordingMath.ts'

export type RecordingSnapshot = {
  phase: RecordingPhase
  countdown: number | null
  elapsedSeconds: number
  inputLevel: number
  mimeType: string | null
  trackReadyState: MediaStreamTrackState | 'not-created'
  blobSize: number
  error: string | null
}

export type CompletedRecording = { blob: Blob; mimeType: string; blobSize: number }
export type InputMeter = { readLevel: () => number; dispose: () => void }

const INITIAL_SNAPSHOT: RecordingSnapshot = {
  phase: 'not-requested', countdown: null, elapsedSeconds: 0, inputLevel: 0, mimeType: null,
  trackReadyState: 'not-created', blobSize: 0, error: null,
}

type RecorderCallbacks = {
  onSnapshot: (snapshot: RecordingSnapshot) => void
  onComplete: (recording: CompletedRecording) => Promise<void> | void
  createInputMeter?: (stream: MediaStream) => InputMeter
}

/** Owns microphone-only capture. It never receives, stops, or replaces the camera stream. */
export class MicrophoneRecorder {
  private readonly callbacks: RecorderCallbacks
  private snapshot: RecordingSnapshot = INITIAL_SNAPSHOT
  private stream: MediaStream | null = null
  private recorder: MediaRecorder | null = null
  private meter: InputMeter | null = null
  private animationFrame: number | null = null
  private countdownTimer: number | null = null
  private elapsedTimer: number | null = null
  private autoStopTimer: number | null = null
  private startedAt = 0
  private session = 0
  private chunks: BlobPart[] = []

  constructor(callbacks: RecorderCallbacks) { this.callbacks = callbacks }

  async begin() {
    if (this.stream || this.recorder || isRecordingSessionActive(this.snapshot.phase)) return
    if (!navigator.mediaDevices?.getUserMedia) return this.fail('microphone-unavailable', 'This browser cannot access a microphone.')
    if (typeof MediaRecorder === 'undefined') return this.fail('recording-error', 'This browser does not support MediaRecorder.')
    const mimeType = selectRecordingMimeType(MediaRecorder.isTypeSupported.bind(MediaRecorder))
    if (!mimeType) return this.fail('recording-error', 'This browser has no supported local recording format.')

    const activeSession = ++this.session
    this.publish({ ...INITIAL_SNAPSHOT, phase: nextRecordingPhase('request'), mimeType })
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: { ideal: 1 }, echoCancellation: true, noiseSuppression: true }, video: false })
      if (activeSession !== this.session) return this.stopTracks(stream)
      const track = stream.getAudioTracks()[0]
      if (!track || track.readyState !== 'live') {
        this.stopTracks(stream)
        return this.fail('microphone-unavailable', 'No live microphone track was returned.')
      }
      this.stream = stream
      this.installMeter(stream)
      this.publish({ ...this.snapshot, phase: nextRecordingPhase('granted'), trackReadyState: track.readyState, error: null })
      this.beginCountdown(activeSession, mimeType)
    } catch (error) {
      if (activeSession !== this.session) return
      const name = error instanceof DOMException ? error.name : ''
      if (name === 'NotAllowedError' || name === 'SecurityError') this.fail('permission-denied', 'Microphone permission was denied. Allow it in Chrome, then try again.')
      else if (name === 'NotFoundError') this.fail('microphone-unavailable', 'No usable microphone was found.')
      else if (name === 'NotReadableError') this.fail('microphone-busy', 'The microphone is busy in another app or browser tab.')
      else this.fail('recording-error', error instanceof Error ? error.message : 'The microphone could not start.')
    }
  }

  stop() {
    if (this.snapshot.phase !== 'recording' || !this.recorder) return
    this.clearTimers()
    this.publish({ ...this.snapshot, phase: nextRecordingPhase('stop'), inputLevel: 0 })
    try { this.recorder.stop() } catch { this.fail('recording-error', 'The recording could not be stopped safely.') }
  }

  cancel() {
    ++this.session
    const recorder = this.recorder
    this.recorder = null
    this.clearTimers()
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop() } catch { /* The mic cleanup below is still required. */ }
    }
    this.cleanupMicrophone()
    this.publish(INITIAL_SNAPSHOT)
  }

  dispose() { this.cancel() }

  private beginCountdown(activeSession: number, mimeType: string) {
    let countdown = 3
    this.publish({ ...this.snapshot, phase: nextRecordingPhase('countdown'), countdown })
    this.countdownTimer = window.setInterval(() => {
      if (activeSession !== this.session) return
      countdown -= 1
      if (countdown <= 0) {
        this.clearCountdown()
        this.startRecording(activeSession, mimeType)
      } else {
        this.publish({ ...this.snapshot, countdown })
      }
    }, 1000)
  }

  private startRecording(activeSession: number, mimeType: string) {
    if (activeSession !== this.session || !this.stream) return
    try {
      const recorder = new MediaRecorder(this.stream, { mimeType })
      this.recorder = recorder
      this.chunks = []
      recorder.ondataavailable = (event) => { if (event.data.size > 0) this.chunks.push(event.data) }
      recorder.onerror = () => this.fail('recording-error', 'The browser reported a recording error.')
      recorder.onstop = () => { void this.finishRecording(activeSession, recorder, mimeType) }
      recorder.start(250)
      this.startedAt = performance.now()
      this.publish({ ...this.snapshot, phase: nextRecordingPhase('record'), countdown: null, elapsedSeconds: 0, trackReadyState: this.stream.getAudioTracks()[0]?.readyState ?? 'not-created' })
      this.elapsedTimer = window.setInterval(() => this.updateElapsed(), 200)
      this.autoStopTimer = window.setTimeout(() => this.stop(), MAX_RECORDING_SECONDS * 1000)
    } catch (error) {
      this.fail('recording-error', error instanceof Error ? error.message : 'The recording could not start.')
    }
  }

  private async finishRecording(activeSession: number, recorder: MediaRecorder, requestedMimeType: string) {
    if (activeSession !== this.session || this.recorder !== recorder) return
    this.recorder = null
    this.clearTimers()
    const blob = new Blob(this.chunks, { type: recorder.mimeType || requestedMimeType })
    this.cleanupMicrophone()
    if (blob.size === 0) return this.fail('recording-error', 'The recording produced no audio data. Try again.')
    this.publish({ ...this.snapshot, phase: nextRecordingPhase('process'), blobSize: blob.size, inputLevel: 0, trackReadyState: 'not-created' })
    try {
      await this.callbacks.onComplete({ blob, mimeType: blob.type || requestedMimeType, blobSize: blob.size })
    } catch (error) {
      this.fail('recording-error', error instanceof Error ? error.message : 'The recording could not be processed.')
    }
  }

  private updateElapsed() {
    if (this.snapshot.phase !== 'recording') return
    const elapsedSeconds = Math.min(MAX_RECORDING_SECONDS, (performance.now() - this.startedAt) / 1000)
    this.publish({ ...this.snapshot, elapsedSeconds })
  }

  private installMeter(stream: MediaStream) {
    try {
      this.meter = this.callbacks.createInputMeter?.(stream) ?? null
      if (!this.meter) return
      let lastPublished = 0
      const updateMeter = (now: number) => {
        if (!this.meter || !this.stream) return
        if (now - lastPublished > 80) {
          lastPublished = now
          this.publish({ ...this.snapshot, inputLevel: this.meter.readLevel() })
        }
        this.animationFrame = requestAnimationFrame(updateMeter)
      }
      this.animationFrame = requestAnimationFrame(updateMeter)
    } catch { /* The recorder remains usable if an optional visual meter is unavailable. */ }
  }

  private cleanupMicrophone() {
    if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame)
    this.animationFrame = null
    this.meter?.dispose(); this.meter = null
    if (this.stream) this.stopTracks(this.stream)
    this.stream = null
  }

  private stopTracks(stream: MediaStream) { stopOwnedMediaTracks(stream) }
  private clearCountdown() { if (this.countdownTimer !== null) window.clearInterval(this.countdownTimer); this.countdownTimer = null }
  private clearTimers() {
    this.clearCountdown()
    if (this.elapsedTimer !== null) window.clearInterval(this.elapsedTimer)
    if (this.autoStopTimer !== null) window.clearTimeout(this.autoStopTimer)
    this.elapsedTimer = null; this.autoStopTimer = null
  }
  private fail(phase: Extract<RecordingPhase, 'permission-denied' | 'microphone-unavailable' | 'microphone-busy' | 'recording-error'>, error: string) {
    this.clearTimers(); this.cleanupMicrophone(); this.recorder = null
    this.publish({ ...this.snapshot, phase, error, inputLevel: 0, trackReadyState: 'not-created' })
  }
  private publish(snapshot: RecordingSnapshot) { this.snapshot = snapshot; this.callbacks.onSnapshot(snapshot) }
}
