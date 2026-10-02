import { describe, expect, it } from 'vitest'
import { deviceLostAction, planUnifiedBackend } from '../../../src/core/rendererBackend'

describe('unified renderer policy', () => {
  it('keeps hardware WebGPU and unknown WebGPU adapters on the actual backend', () => {
    expect(
      planUnifiedBackend({
        backendName: 'WebGPUBackend',
        isFallbackAdapter: false,
      }),
    ).toEqual({
      recreate: false,
      mode: 'webgpu',
    })
    expect(
      planUnifiedBackend({
        backendName: 'WebGPUBackend',
        isFallbackAdapter: null,
      }),
    ).toEqual({
      recreate: false,
      mode: 'webgpu',
    })
  })

  it('recreates software WebGPU adapters using the WebGL fallback path', () => {
    expect(
      planUnifiedBackend({
        backendName: 'WebGPUBackend',
        isFallbackAdapter: true,
      }),
    ).toEqual({
      recreate: true,
      mode: 'webgl',
    })
  })

  it('classifies other or missing backends as WebGL without recreating', () => {
    expect(
      planUnifiedBackend({
        backendName: 'WebGLBackend',
        isFallbackAdapter: null,
      }),
    ).toEqual({
      recreate: false,
      mode: 'webgl',
    })
    expect(planUnifiedBackend({ backendName: null, isFallbackAdapter: null })).toEqual({
      recreate: false,
      mode: 'webgl',
    })
  })

  it('allows only the configured number of device-loss recoveries', () => {
    expect(deviceLostAction(0)).toBe('recover')
    expect(deviceLostAction(1)).toBe('exhausted')
  })

  it('ignores additional loss callbacks while recovery is already running', () => {
    expect(deviceLostAction(1, 1, true)).toBe('ignore')
  })
})
