import { MAX_COMPOSITION_LAYERS, type CompositionLayerMetadata, type CompositionSession } from './compositionTypes.ts'

export function deriveAudibleLayerIds(layers: CompositionLayerMetadata[]) {
  const hasSolo = layers.some((layer) => layer.solo)
  return layers.filter((layer) => !layer.muted && (!hasSolo || layer.solo)).map((layer) => layer.id)
}

export function clampLayerVolume(value: number) { return Math.max(0, Math.min(1.5, Number.isFinite(value) ? value : 1)) }

export function validateLayerName(name: string) {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('A layer name cannot be empty.')
  if (trimmed.length > 48) throw new Error('Layer names must be 48 characters or shorter.')
  return trimmed
}

export function validateLayerForSession(session: CompositionSession, layer: CompositionLayerMetadata) {
  if (session.layers.some((existing) => existing.id === layer.id)) throw new Error('Layer IDs must be unique.')
  if (session.layers.length >= MAX_COMPOSITION_LAYERS) throw new Error('This composition already has the four-layer limit.')
  if (layer.bpm !== session.bpm || layer.barCount !== session.barCount || layer.frameCount !== session.expectedFrameCount || layer.sampleRate !== session.sampleRate || layer.durationSeconds !== session.durationSeconds) {
    throw new Error('Every layer must match the composition timing and exact frame count.')
  }
}
