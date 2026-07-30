import assert from 'node:assert/strict'
import test from 'node:test'
import { CameraLifecycle } from './cameraLifecycle.ts'

function createFakeStream(id: string, tracks = 1) {
  const fakeTracks = Array.from({ length: tracks }, (_, index) => ({
    id: `${id}-track-${index}`,
    readyState: 'live' as MediaStreamTrackState,
    stopCalls: 0,
    stop() {
      this.stopCalls += 1
      this.readyState = 'ended'
    },
  }))

  return {
    stream: {
      id,
      getTracks: () => fakeTracks,
      getVideoTracks: () => fakeTracks,
    } as unknown as MediaStream,
    tracks: fakeTracks,
  }
}

function createLifecycle() {
  return new CameraLifecycle(() => undefined)
}

test('an obsolete request cannot stop a newer active stream', () => {
  const lifecycle = createLifecycle()
  const oldStream = createFakeStream('old')
  const newStream = createFakeStream('new')
  lifecycle.mount()

  const oldGeneration = lifecycle.beginRequest()
  lifecycle.stopActive('user requested stop')
  const newGeneration = lifecycle.beginRequest()
  assert.ok(oldGeneration)
  assert.ok(newGeneration)
  assert.equal(lifecycle.acceptStream(newGeneration, newStream.stream), true)
  assert.equal(lifecycle.acceptStream(oldGeneration, oldStream.stream), false)

  assert.equal(oldStream.tracks[0].readyState, 'ended')
  assert.equal(newStream.tracks[0].readyState, 'live')
})

test('repeated start attempts allow only one active request', () => {
  const lifecycle = createLifecycle()
  lifecycle.mount()

  assert.ok(lifecycle.beginRequest())
  assert.equal(lifecycle.beginRequest(), null)
})

test('repeated stop calls are safe', () => {
  const lifecycle = createLifecycle()
  const camera = createFakeStream('camera')
  lifecycle.mount()
  const generation = lifecycle.beginRequest()
  assert.ok(generation)
  lifecycle.acceptStream(generation, camera.stream)

  lifecycle.stopActive('user requested stop')
  lifecycle.stopActive('user requested stop')

  assert.equal(camera.tracks[0].stopCalls, 1)
})

test('model and camera-state observations do not stop the active stream', () => {
  const lifecycle = createLifecycle()
  const camera = createFakeStream('camera')
  lifecycle.mount()
  const generation = lifecycle.beginRequest()
  assert.ok(generation)
  lifecycle.acceptStream(generation, camera.stream)

  assert.equal(lifecycle.getActiveStream(), camera.stream)
  assert.equal(camera.tracks[0].readyState, 'live')
})

test('explicit Stop Camera stops every track', () => {
  const lifecycle = createLifecycle()
  const camera = createFakeStream('camera', 2)
  lifecycle.mount()
  const generation = lifecycle.beginRequest()
  assert.ok(generation)
  lifecycle.acceptStream(generation, camera.stream)

  lifecycle.stopActive('user requested stop')

  assert.deepEqual(camera.tracks.map((track) => track.stopCalls), [1, 1])
})

test('unmount cleanup stops only the current stream', () => {
  const lifecycle = createLifecycle()
  const oldCamera = createFakeStream('old')
  const activeCamera = createFakeStream('active')
  lifecycle.mount()
  const oldGeneration = lifecycle.beginRequest()
  assert.ok(oldGeneration)
  lifecycle.stopActive('user requested stop')
  const activeGeneration = lifecycle.beginRequest()
  assert.ok(activeGeneration)
  lifecycle.acceptStream(activeGeneration, activeCamera.stream)
  lifecycle.acceptStream(oldGeneration, oldCamera.stream)

  lifecycle.unmount()

  assert.equal(oldCamera.tracks[0].stopCalls, 1)
  assert.equal(activeCamera.tracks[0].stopCalls, 1)
})

test('a failed video.play cleans up only the failed active stream', () => {
  const lifecycle = createLifecycle()
  const failedCamera = createFakeStream('failed')
  lifecycle.mount()
  const generation = lifecycle.beginRequest()
  assert.ok(generation)
  lifecycle.acceptStream(generation, failedCamera.stream)

  assert.equal(lifecycle.stopOwnedStream(generation, failedCamera.stream, 'camera startup failed'), true)
  assert.equal(failedCamera.tracks[0].readyState, 'ended')
})

test('a StrictMode-style setup and cleanup leaves the final stream live', () => {
  const lifecycle = createLifecycle()
  const finalCamera = createFakeStream('final')
  lifecycle.mount()
  lifecycle.unmount()
  lifecycle.mount()
  const generation = lifecycle.beginRequest()
  assert.ok(generation)
  lifecycle.acceptStream(generation, finalCamera.stream)

  assert.equal(finalCamera.tracks[0].readyState, 'live')
})
