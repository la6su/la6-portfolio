import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { RenderPipeline } from '../core/RenderPipeline'

class WebGPUBackend {}
class WebGLBackend {}

describe('RenderPipeline failure lifecycle', () => {
  it('disables a failing TSL graph and falls back without retrying it', () => {
    const render = vi.fn(() => {
      throw new Error('device lost during post render')
    })
    const renderer = {
      backend: new WebGPUBackend(),
      toneMapping: THREE.ACESFilmicToneMapping,
      render: vi.fn(),
    }
    const pipeline = Object.assign(Object.create(RenderPipeline.prototype), {
      _renderer: renderer,
      _postProcessingEnabled: true,
      _webgpuPipeline: {
        setScene: vi.fn(),
        updateParams: vi.fn(),
        render,
        dispose: vi.fn(),
      },
      _webgpuParamsDirty: true,
      _params: {
        bloom: 0.4,
        vignette: 0.5,
        grain: 0.25,
        chromatic: 0,
        bloomRadius: 0.6,
        bloomThreshold: 0.5,
        refract: 0.05,
        border: 0,
        gradeShadows: [1, 1, 1],
        gradeHighlights: [1, 1, 1],
      },
      _webgpuParamsCache: {
        bloom: 0,
        bloomRadius: 0,
        bloomThreshold: 0,
        vignette: 0,
        grain: 0,
        chromatic: 0,
        refract: 0,
        border: 0,
        gradeShadows: [1, 1, 1],
        gradeHighlights: [1, 1, 1],
      },
    }) as RenderPipeline

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera()
    expect(() => pipeline.render(scene, camera)).not.toThrow()
    expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping)
    expect(render).toHaveBeenCalledOnce()
    expect(renderer.render).toHaveBeenCalledOnce()

    pipeline.render(scene, camera)
    expect(render).toHaveBeenCalledOnce()
    expect(renderer.render).toHaveBeenCalledTimes(2)
  })

  it('restores scene fog after a WebGLBackend fallback draw fails', () => {
    const render = vi.fn(() => {
      throw new Error('fallback draw failed')
    })
    const renderer = {
      backend: new WebGLBackend(),
      render,
    }
    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0x112233, 1, 10)
    const fog = scene.fog
    const pipeline = Object.assign(Object.create(RenderPipeline.prototype), {
      _renderer: renderer,
      _webgpuPipeline: null,
    }) as RenderPipeline

    expect(() => pipeline.render(scene, new THREE.PerspectiveCamera())).toThrow(
      'fallback draw failed',
    )
    expect(scene.fog).toBe(fog)
    expect(render).toHaveBeenCalledOnce()
  })

  it('skips the TSL graph when native WebGPU post processing is disabled', () => {
    const render = vi.fn()
    const renderer = {
      backend: new WebGPUBackend(),
      render,
    }
    const pipeline = Object.assign(Object.create(RenderPipeline.prototype), {
      _renderer: renderer,
      _postProcessingEnabled: false,
      _webgpuPipeline: null,
    }) as RenderPipeline

    pipeline.render(new THREE.Scene(), new THREE.PerspectiveCamera())

    expect(render).toHaveBeenCalledOnce()
    expect((pipeline as unknown as { _webgpuPipeline: unknown })._webgpuPipeline).toBeNull()
  })

  it('skips settled WebGPU uniform handoff until params become dirty', () => {
    const updateParams = vi.fn()
    const render = vi.fn()
    const renderer = {
      backend: new WebGPUBackend(),
      toneMapping: THREE.NoToneMapping,
    }
    const pipeline = Object.assign(Object.create(RenderPipeline.prototype), {
      _renderer: renderer,
      _webgpuPipeline: {
        setScene: vi.fn(() => false),
        updateParams,
        render,
      },
      _postProcessingEnabled: true,
      _webgpuPostFailed: false,
      _webgpuParamsDirty: true,
      _params: {
        bloom: 0.4,
        vignette: 0.5,
        grain: 0.25,
        chromatic: 0,
        bloomRadius: 0.6,
        bloomThreshold: 0.5,
        refract: 0.05,
        border: 0,
        gradeShadows: [1, 1, 1],
        gradeHighlights: [1, 1, 1],
      },
      _webgpuParamsCache: {
        bloom: 0,
        bloomRadius: 0,
        bloomThreshold: 0,
        vignette: 0,
        grain: 0,
        chromatic: 0,
        refract: 0,
        border: 0,
        gradeShadows: [1, 1, 1],
        gradeHighlights: [1, 1, 1],
      },
    }) as RenderPipeline

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera()
    pipeline.render(scene, camera)
    const cache = (
      pipeline as unknown as {
        _webgpuParamsCache: { bloom: number }
      }
    )._webgpuParamsCache
    pipeline.render(scene, camera)
    expect(updateParams).toHaveBeenCalledOnce()
    cache.bloom = 99
    pipeline.render(scene, camera)
    expect(cache.bloom).toBe(99)

    pipeline.updateParams({
      bloom: 0.8,
      vignette: 0.5,
      grain: 0.25,
      chromatic: 0,
      bloomRadius: 0.6,
      bloomThreshold: 0.5,
      refract: 0.05,
      border: 0,
      gradeShadows: [1, 1, 1],
      gradeHighlights: [1, 1, 1],
    })
    pipeline.render(scene, camera)
    expect(updateParams).toHaveBeenCalledTimes(2)
    expect(cache.bloom).toBe(0.8)
  })

  it('reports post-owner resources and zeros the WebGLBackend shape', () => {
    const pipeline = Object.assign(Object.create(RenderPipeline.prototype), {
      _webgpuPipeline: {
        getResourceInfo: vi.fn(() => ({ renderTargets: 6, passes: 1 })),
      },
    }) as RenderPipeline

    expect(pipeline.getResourceInfo()).toEqual({
      renderTargets: 6,
      passes: 1,
      webgpuPipeline: true,
    })

    Object.assign(pipeline, { _webgpuPipeline: null })
    expect(pipeline.getResourceInfo()).toEqual({
      renderTargets: 0,
      passes: 0,
      webgpuPipeline: false,
    })
  })
})
