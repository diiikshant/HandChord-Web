export type PcmCapture = {
  startFrame: number
  endFrame: number
  expectedFrameCount: number
  channelCount: number
  chunks: Float32Array[][]
  receivedFrameCount: number
}

export type PcmCaptureResult = {
  channels: Float32Array[]
  expectedFrameCount: number
  receivedFrameCount: number
}

/**
 * One AudioWorklet recorder per AudioContext. It taps internal performance PCM,
 * not a microphone or the speaker destination.
 */
export class CompositionPcmRecorder {
  private node: AudioWorkletNode | null = null
  private silentOutput: GainNode | null = null
  private loading: Promise<void> | null = null
  private capture: PcmCapture | null = null
  private completeResolver: ((result: PcmCaptureResult | null) => void) | null = null
  private status: 'idle' | 'loading' | 'ready' | 'error' = 'idle'
  private readonly context: AudioContext
  private readonly tap: AudioNode
  private readonly keepAliveOutput: AudioNode

  constructor(context: AudioContext, tap: AudioNode, keepAliveOutput: AudioNode) {
    this.context = context
    this.tap = tap
    this.keepAliveOutput = keepAliveOutput
  }

  get workletStatus() { return this.status }
  get active() { return this.capture !== null }

  async prepare() {
    if (this.node) return
    if (this.loading) return this.loading
    if (!('audioWorklet' in this.context) || typeof AudioWorkletNode === 'undefined') {
      this.status = 'error'
      throw new Error('This browser does not support the AudioWorklet recorder required for composition loops.')
    }
    this.status = 'loading'
    this.loading = this.context.audioWorklet.addModule('/worklets/composition-recorder.worklet.js').then(() => {
      const node = new AudioWorkletNode(this.context, 'handchord-composition-recorder', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 2, channelCountMode: 'max' })
      const silentOutput = this.context.createGain()
      silentOutput.gain.setValueAtTime(0, this.context.currentTime)
      // The live tap keeps its normal direct monitoring connection. This silent
      // branch exists solely to keep the worklet processing; it cannot duplicate audio.
      this.tap.connect(node)
      node.connect(silentOutput).connect(this.keepAliveOutput)
      node.port.onmessage = (event: MessageEvent<{ type: string; channels?: Float32Array[] }>) => this.handleMessage(event.data)
      this.node = node
      this.silentOutput = silentOutput
      this.status = 'ready'
    }).catch((error) => {
      this.status = 'error'
      this.loading = null
      throw error
    })
    return this.loading
  }

  async arm(startFrame: number, endFrame: number, channelCount = 2): Promise<{ completion: Promise<PcmCaptureResult | null> }> {
    if (this.capture) throw new Error('Composition recording is already active.')
    if (!Number.isInteger(startFrame) || !Number.isInteger(endFrame) || endFrame <= startFrame) throw new Error('Composition recording has an invalid frame range.')
    await this.prepare()
    if (!this.node) throw new Error('The composition recording worklet could not start.')
    const capture: PcmCapture = {
      startFrame,
      endFrame,
      expectedFrameCount: endFrame - startFrame,
      channelCount,
      chunks: Array.from({ length: channelCount }, () => []),
      receivedFrameCount: 0,
    }
    this.capture = capture
    const completion = new Promise<PcmCaptureResult | null>((resolve) => { this.completeResolver = resolve })
    this.node.port.postMessage({ type: 'arm', startFrame, endFrame, channelCount })
    return { completion }
  }

  cancel() {
    if (this.node) this.node.port.postMessage({ type: 'cancel' })
    this.completeResolver?.(null)
    this.capture = null
    this.completeResolver = null
  }

  dispose() {
    this.cancel()
    this.node?.disconnect()
    this.silentOutput?.disconnect()
    this.node = null
    this.silentOutput = null
  }

  private handleMessage(message: { type: string; channels?: Float32Array[] }) {
    const capture = this.capture
    if (!capture) return
    if (message.type === 'chunk' && message.channels) {
      message.channels.forEach((channel, index) => {
        if (index < capture.chunks.length) capture.chunks[index].push(channel)
      })
      capture.receivedFrameCount += message.channels[0]?.length ?? 0
      return
    }
    if (message.type === 'complete') {
      const channels = capture.chunks.map((chunks) => combineFrames(chunks, capture.expectedFrameCount))
      const resolver = this.completeResolver
      this.capture = null
      this.completeResolver = null
      resolver?.({ channels, expectedFrameCount: capture.expectedFrameCount, receivedFrameCount: capture.receivedFrameCount })
    }
  }
}

/** Trims extra worklet frames and pads missing boundary frames with silence. */
export function combineFrames(chunks: Float32Array[], expectedFrameCount: number) {
  const result = new Float32Array(expectedFrameCount)
  let offset = 0
  for (const chunk of chunks) {
    if (offset >= expectedFrameCount) break
    const usableLength = Math.min(chunk.length, expectedFrameCount - offset)
    result.set(chunk.subarray(0, usableLength), offset)
    offset += usableLength
  }
  return result
}
