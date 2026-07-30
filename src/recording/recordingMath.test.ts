import assert from 'node:assert/strict'
import test from 'node:test'
import { detectSilenceBoundaries, isRecordingSessionActive, MAX_RECORDING_SECONDS, nextRecordingPhase, remainingRecordingSeconds, selectRecordingMimeType, stopOwnedMediaTracks } from './recordingMath.ts'

const audibleBuffer = {
  length: 12,
  numberOfChannels: 1,
  sampleRate: 10,
  duration: 1.2,
  getChannelData: () => Float32Array.from([0, 0, 0.04, 0.08, 0.1, 0.06, 0.02, 0, 0, 0, 0, 0]),
}

test('selects a browser-supported recording MIME type without hard-coding one', () => {
  assert.equal(selectRecordingMimeType((mime) => mime === 'audio/webm'), 'audio/webm')
  assert.equal(selectRecordingMimeType(() => false), null)
})

test('uses deterministic recording states and a ten-second maximum', () => {
  assert.equal(nextRecordingPhase('request'), 'requesting-permission')
  assert.equal(nextRecordingPhase('countdown'), 'countdown')
  assert.equal(nextRecordingPhase('record'), 'recording')
  assert.equal(nextRecordingPhase('cancel'), 'not-requested')
  assert.equal(MAX_RECORDING_SECONDS, 10)
  assert.equal(remainingRecordingSeconds(3.2), 6.8)
  assert.equal(remainingRecordingSeconds(15), 0)
  assert.equal(isRecordingSessionActive('countdown'), true)
  assert.equal(isRecordingSessionActive('recording'), true)
  assert.equal(isRecordingSessionActive('not-requested'), false)
})

test('stops only microphone tracks handed to the recording owner', () => {
  let microphoneStops = 0
  let cameraStops = 0
  const microphoneStream = { getTracks: () => [{ stop: () => { microphoneStops += 1 } }] } as unknown as MediaStream
  const cameraStream = { getTracks: () => [{ stop: () => { cameraStops += 1 } }] } as unknown as MediaStream
  stopOwnedMediaTracks(microphoneStream)
  assert.equal(microphoneStops, 1)
  assert.equal(cameraStops, 0)
  assert.equal(cameraStream.getTracks()[0] !== undefined, true)
})

test('suggests only leading and trailing silence trims and warns for nearly silent recordings', () => {
  assert.deepEqual(detectSilenceBoundaries(audibleBuffer), { trimStartSeconds: 0.2, trimEndSeconds: 0.7, nearlySilent: false })
  const silentBuffer = { ...audibleBuffer, getChannelData: () => Float32Array.from({ length: 12 }, () => 0) }
  assert.deepEqual(detectSilenceBoundaries(silentBuffer), { trimStartSeconds: 0, trimEndSeconds: 1.2, nearlySilent: true })
})
