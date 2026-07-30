import assert from 'node:assert/strict'
import test from 'node:test'
import { getCameraErrorStatus } from './cameraState.ts'

test('marks a blocked camera permission as denied', () => {
  const error = new DOMException('Permission blocked', 'NotAllowedError')

  assert.equal(getCameraErrorStatus(error), 'denied')
})

test('marks a missing camera as unavailable', () => {
  const error = new DOMException('No camera found', 'NotFoundError')

  assert.equal(getCameraErrorStatus(error), 'unavailable')
})

test('marks unexpected camera failures as errors', () => {
  assert.equal(getCameraErrorStatus(new Error('Something went wrong')), 'error')
})
