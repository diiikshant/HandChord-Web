export type InstrumentId = 'warm-pad' | 'soft-keys' | 'pluck' | 'organ' | 'deep-bass'

export type OscillatorLayer = {
  waveform: OscillatorType
  level: number
  detuneCents: number
}

export type InstrumentEnvelope = {
  attackSeconds: number
  decaySeconds: number
  sustainLevel: number
  releaseSeconds: number
}

export type InstrumentFilter = {
  frequencyHz: number
  q: number
}

export type InstrumentDefinition = {
  id: InstrumentId
  name: string
  description: string
  oscillators: OscillatorLayer[]
  envelope: InstrumentEnvelope
  filter: InstrumentFilter
  octaveOffset: number
  gainCompensation: number
  autoReleaseSeconds?: number
}
