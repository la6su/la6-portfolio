import { describe, expect, it } from 'vitest'
import { deviceLostAction, modeForBackend } from '../../../src/core/rendererBackend'

describe('renderer backend mode', () => {
  it('uses the backend selected by Three without recreating the renderer', () => {
    expect(modeForBackend('WebGPUBackend')).toBe('webgpu')
    expect(modeForBackend('WebGLBackend')).toBe('webgl')
    expect(modeForBackend(null)).toBeNull()
  })

  it('allows only the configured number of device-loss recoveries', () => {
    expect(deviceLostAction(0)).toBe('recover')
    expect(deviceLostAction(1)).toBe('exhausted')
  })

  it('ignores additional loss callbacks while recovery is already running', () => {
    expect(deviceLostAction(1, 1, true)).toBe('ignore')
  })
})
