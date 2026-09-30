import { describe, expect, it } from 'vitest'

import {
  deviceLostAction,
  MAX_DEVICE_LOST_RECOVERIES,
  planUnifiedBackend,
} from '../core/rendererBackend'
import { inspectUnifiedBackend } from '../core/unifiedRenderer'
import { supportsPostProcessing } from '../core/DeviceCapability'

describe('supportsPostProcessing', () => {
  it('enables TSL post only for non-low native WebGPU', () => {
    expect(supportsPostProcessing('webgpu', 'high')).toBe(true)
    expect(supportsPostProcessing('webgpu', 'medium')).toBe(true)
    expect(supportsPostProcessing('webgpu', 'low')).toBe(false)
    expect(supportsPostProcessing('webgl', 'high')).toBe(false)
    expect(supportsPostProcessing('unsupported', 'high')).toBe(false)
  })
})

describe('planUnifiedBackend (Phase 6 unified renderer policy)', () => {
  it('keeps a real WebGPUBackend as webgpu mode', () => {
    const plan = planUnifiedBackend({
      backendName: 'WebGPUBackend',
      isFallbackAdapter: false,
    })
    expect(plan).toEqual({ recreate: false, mode: 'webgpu' })
  })

  it('re-creates with forceWebGL on a software (SwiftShader) adapter', () => {
    const plan = planUnifiedBackend({
      backendName: 'WebGPUBackend',
      isFallbackAdapter: true,
    })
    expect(plan).toEqual({ recreate: true, mode: 'webgl' })
  })

  it('keeps the automatic WebGLBackend fallback as webgl mode (no re-create)', () => {
    const plan = planUnifiedBackend({
      backendName: 'WebGLBackend',
      isFallbackAdapter: false,
    })
    expect(plan).toEqual({ recreate: false, mode: 'webgl' })
  })

  it('falls back to webgl (no re-create) when the backend name is unknown', () => {
    const plan = planUnifiedBackend({
      backendName: null,
      isFallbackAdapter: false,
    })
    expect(plan).toEqual({ recreate: false, mode: 'webgl' })
  })

  it('keeps WebGPUBackend + null (unknown adapter) as webgpu (no re-create)', () => {
    const plan = planUnifiedBackend({
      backendName: 'WebGPUBackend',
      isFallbackAdapter: null,
    })
    expect(plan).toEqual({ recreate: false, mode: 'webgpu' })
  })

  it('handles WebGLBackend + null (unknown adapter) as webgl (no re-create)', () => {
    const plan = planUnifiedBackend({
      backendName: 'WebGLBackend',
      isFallbackAdapter: null,
    })
    expect(plan).toEqual({ recreate: false, mode: 'webgl' })
  })

  it('handles unknown backend name + null (unknown adapter) as webgl (no re-create)', () => {
    const plan = planUnifiedBackend({
      backendName: 'UnknownRenderer',
      isFallbackAdapter: null,
    })
    expect(plan).toEqual({ recreate: false, mode: 'webgl' })
  })
})

describe('inspectUnifiedBackend (production backend facts)', () => {
  it('preserves unknown adapter classification as null', () => {
    const facts = inspectUnifiedBackend({
      isWebGPURenderer: true,
      backend: { constructor: { name: 'WebGPUBackend' } },
    })

    expect(facts).toEqual({ backendName: 'WebGPUBackend', isFallbackAdapter: null })
    expect(planUnifiedBackend(facts)).toEqual({ recreate: false, mode: 'webgpu' })
  })

  it('preserves a confirmed software adapter for WebGL recreation', () => {
    const facts = inspectUnifiedBackend({
      isWebGPURenderer: true,
      backend: {
        constructor: { name: 'WebGPUBackend' },
        device: { adapterInfo: { isFallbackAdapter: true } },
      },
    })

    expect(facts).toEqual({ backendName: 'WebGPUBackend', isFallbackAdapter: true })
    expect(planUnifiedBackend(facts)).toEqual({ recreate: true, mode: 'webgl' })
  })

  it('preserves a confirmed hardware adapter for WebGPU', () => {
    const facts = inspectUnifiedBackend({
      isWebGPURenderer: true,
      backend: {
        constructor: { name: 'WebGPUBackend' },
        device: { adapterInfo: { isFallbackAdapter: false } },
      },
    })

    expect(facts).toEqual({ backendName: 'WebGPUBackend', isFallbackAdapter: false })
    expect(planUnifiedBackend(facts)).toEqual({ recreate: false, mode: 'webgpu' })
  })

  it('uses Three backend markers when production minifies constructor names', () => {
    const facts = inspectUnifiedBackend({
      isWebGPURenderer: true,
      backend: {
        constructor: { name: 'jf' },
        isWebGPUBackend: true,
        device: { adapterInfo: { isFallbackAdapter: false } },
      },
    })

    expect(facts).toEqual({ backendName: 'WebGPUBackend', isFallbackAdapter: false })
  })

  it('recognizes the automatic WebGL backend by its public marker', () => {
    const facts = inspectUnifiedBackend({
      isWebGPURenderer: true,
      backend: {
        constructor: { name: 'jf' },
        isWebGLBackend: true,
      },
    })

    expect(facts).toEqual({ backendName: 'WebGLBackend', isFallbackAdapter: null })
    expect(planUnifiedBackend(facts)).toEqual({ recreate: false, mode: 'webgl' })
  })
})

describe('deviceLostAction (bounded device-loss recovery)', () => {
  it('allows a recovery while the budget is unspent', () => {
    expect(deviceLostAction(0)).toBe('recover')
  })

  it('exhausts once the budget is spent', () => {
    expect(deviceLostAction(MAX_DEVICE_LOST_RECOVERIES)).toBe('exhausted')
  })

  it('honours a custom budget', () => {
    expect(deviceLostAction(1, 3)).toBe('recover')
    expect(deviceLostAction(3, 3)).toBe('exhausted')
  })
})
