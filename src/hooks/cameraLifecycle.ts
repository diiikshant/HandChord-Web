export type StopReason =
  | 'user requested stop'
  | 'component unmounted'
  | 'replaced by a newer stream'
  | 'obsolete camera request'
  | 'camera startup failed'

type StopLogger = (stream: MediaStream, reason: StopReason) => void

export function stopStreamTracks(stream: MediaStream, reason: StopReason, logStop: StopLogger) {
  logStop(stream, reason)

  stream.getTracks().forEach((track) => {
    if (track.readyState !== 'ended') {
      track.stop()
    }
  })
}

export class CameraLifecycle {
  private active: { generation: number; stream: MediaStream } | null = null
  private requestGeneration: number | null = null
  private nextGeneration = 0
  private mounted = false
  private readonly logStop: StopLogger

  constructor(logStop: StopLogger) {
    this.logStop = logStop
  }

  mount() {
    this.mounted = true
  }

  beginRequest(): number | null {
    if (!this.mounted || this.requestGeneration !== null || this.active !== null) {
      return null
    }

    const generation = ++this.nextGeneration
    this.requestGeneration = generation
    return generation
  }

  acceptStream(generation: number, stream: MediaStream): boolean {
    if (!this.mounted || this.requestGeneration !== generation) {
      stopStreamTracks(stream, 'obsolete camera request', this.logStop)
      return false
    }

    this.requestGeneration = null
    if (this.active) {
      stopStreamTracks(this.active.stream, 'replaced by a newer stream', this.logStop)
    }
    this.active = { generation, stream }
    return true
  }

  rejectRequest(generation: number) {
    if (this.requestGeneration === generation) {
      this.requestGeneration = null
    }
  }

  discardStream(stream: MediaStream, reason: StopReason) {
    stopStreamTracks(stream, reason, this.logStop)
  }

  ownsStream(generation: number, stream: MediaStream): boolean {
    return this.mounted && this.active?.generation === generation && this.active.stream === stream
  }

  isPendingRequest(generation: number): boolean {
    return this.mounted && this.requestGeneration === generation
  }

  stopActive(reason: StopReason): MediaStream | null {
    this.requestGeneration = null
    this.nextGeneration += 1
    const activeStream = this.active?.stream ?? null
    this.active = null

    if (activeStream) {
      stopStreamTracks(activeStream, reason, this.logStop)
    }

    return activeStream
  }

  stopOwnedStream(generation: number, stream: MediaStream, reason: StopReason): boolean {
    if (!this.ownsStream(generation, stream)) {
      return false
    }

    this.active = null
    this.nextGeneration += 1
    stopStreamTracks(stream, reason, this.logStop)
    return true
  }

  unmount() {
    this.mounted = false
    this.stopActive('component unmounted')
  }

  getActiveStream() {
    return this.active?.stream ?? null
  }
}
