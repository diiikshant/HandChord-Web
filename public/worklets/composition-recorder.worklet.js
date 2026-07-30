class CompositionRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.startFrame = null
    this.endFrame = null
    this.channelCount = 0
    this.pending = []
    this.pendingFrames = 0
    this.port.onmessage = ({ data }) => {
      if (data.type === 'arm') {
        this.startFrame = data.startFrame
        this.endFrame = data.endFrame
        this.channelCount = data.channelCount
        this.pending = Array.from({ length: this.channelCount }, () => [])
        this.pendingFrames = 0
      }
      if (data.type === 'cancel') this.reset()
    }
  }

  process(inputs, outputs) {
    // The node stays connected through a zero-gain route so Chrome keeps this
    // processor alive. Its output is intentionally silence, never a second copy
    // of the live signal.
    outputs.forEach((output) => output.forEach((channel) => channel.fill(0)))
    if (this.startFrame === null || this.endFrame === null) return true
    const input = inputs[0]
    if (!input || input.length === 0) return true
    const blockStart = currentFrame
    const blockEnd = blockStart + input[0].length
    const captureStart = Math.max(blockStart, this.startFrame)
    const captureEnd = Math.min(blockEnd, this.endFrame)
    if (captureEnd > captureStart) {
      const offset = captureStart - blockStart
      const length = captureEnd - captureStart
      for (let channel = 0; channel < this.channelCount; channel += 1) {
        const source = input[Math.min(channel, input.length - 1)]
        this.pending[channel].push(source.slice(offset, offset + length))
      }
      this.pendingFrames += length
      if (this.pendingFrames >= 2048 || captureEnd === this.endFrame) this.flush()
    }
    if (blockEnd >= this.endFrame) {
      this.port.postMessage({ type: 'complete' })
      this.reset()
    }
    return true
  }

  flush() {
    if (!this.pendingFrames) return
    const channels = this.pending.map((pieces) => {
      const combined = new Float32Array(this.pendingFrames)
      let offset = 0
      pieces.forEach((piece) => { combined.set(piece, offset); offset += piece.length })
      return combined
    })
    this.port.postMessage({ type: 'chunk', channels }, channels.map((channel) => channel.buffer))
    this.pending = Array.from({ length: this.channelCount }, () => [])
    this.pendingFrames = 0
  }

  reset() {
    this.startFrame = null
    this.endFrame = null
    this.pending = []
    this.pendingFrames = 0
  }
}

registerProcessor('handchord-composition-recorder', CompositionRecorderProcessor)
