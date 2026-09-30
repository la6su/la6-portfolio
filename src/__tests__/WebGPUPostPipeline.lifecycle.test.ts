import { describe, expect, it, vi } from 'vitest'
import { WebGPUPostPipeline } from '../core/WebGPUPostPipeline'

describe('WebGPUPostPipeline resource lifecycle', () => {
  it('disposes the scene pass render target exactly once', () => {
    const passDispose = vi.fn()
    const pipelineDispose = vi.fn()
    const owner = Object.assign(Object.create(WebGPUPostPipeline.prototype), {
      _pipeline: { dispose: pipelineDispose },
      _scenePass: { dispose: passDispose },
    }) as WebGPUPostPipeline

    owner.dispose()
    owner.dispose()

    expect(pipelineDispose).toHaveBeenCalledOnce()
    expect(passDispose).toHaveBeenCalledOnce()
  })

  it('clears a throwing scene pass before continuing teardown', () => {
    const passDispose = vi.fn(() => {
      throw new Error('backend pass teardown failed')
    })
    const pipelineDispose = vi.fn()
    const owner = Object.assign(Object.create(WebGPUPostPipeline.prototype), {
      _pipeline: { dispose: pipelineDispose },
      _scenePass: { dispose: passDispose },
    }) as WebGPUPostPipeline

    expect(() => owner.dispose()).not.toThrow()
    owner.dispose()

    expect(pipelineDispose).toHaveBeenCalledOnce()
    expect(passDispose).toHaveBeenCalledOnce()
    expect((owner as unknown as { _scenePass: unknown })._scenePass).toBeNull()
  })

  it('enumerates live scene and bloom render targets and clears them on teardown', () => {
    const sceneTarget = {}
    const brightTarget = {}
    const horizontalTarget = {}
    const verticalTarget = {}
    const bloomDispose = vi.fn()
    const owner = Object.assign(Object.create(WebGPUPostPipeline.prototype), {
      _scenePass: { renderTarget: sceneTarget, dispose: vi.fn() },
      _bloomNode: {
        _renderTargetBright: brightTarget,
        _renderTargetsHorizontal: [horizontalTarget],
        _renderTargetsVertical: [verticalTarget, horizontalTarget],
        dispose: bloomDispose,
      },
      _pipeline: null,
    }) as WebGPUPostPipeline

    expect(owner.getResourceInfo()).toEqual({ renderTargets: 4, passes: 1 })
    owner.dispose()
    owner.dispose()

    expect(bloomDispose).toHaveBeenCalledOnce()
    expect(owner.getResourceInfo()).toEqual({ renderTargets: 0, passes: 0 })
  })

  it('tolerates a bloom owner without private render-target fields', () => {
    const owner = Object.assign(Object.create(WebGPUPostPipeline.prototype), {
      _scenePass: { renderTarget: {}, dispose: vi.fn() },
      _bloomNode: {},
      _pipeline: null,
    }) as WebGPUPostPipeline

    expect(owner.getResourceInfo()).toEqual({ renderTargets: 1, passes: 1 })
  })
})
