import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { eventBus } from '../core/EventBus'
import type { PostParams } from '../core/postParams'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  init: vi.fn(),
  inspect: vi.fn(() => ({ backendName: 'WebGPU', isFallbackAdapter: false })),
  plan: vi.fn(() => ({ recreate: false, mode: 'webgpu' })),
  deviceLostAction: vi.fn(() => 'recover'),
  pipelineCreate: vi.fn(() => ({
    dispose: vi.fn(),
    updateParams: vi.fn(),
    render: vi.fn(),
    getResourceInfo: vi.fn(() => ({ renderTargets: 0, passes: 0, webgpuPipeline: false })),
  })),
}))

vi.mock('../core/unifiedRenderer', () => ({
  createUnifiedWebGPUInstance: mocks.create,
  initUnifiedWebGPUInstance: mocks.init,
  inspectUnifiedBackend: mocks.inspect,
}))

vi.mock('../core/rendererBackend', () => ({
  deviceLostAction: mocks.deviceLostAction,
  planUnifiedBackend: mocks.plan,
}))

vi.mock('../core/RenderPipeline', () => ({
  RenderPipeline: { create: mocks.pipelineCreate },
}))

import { Renderer, type AdoptedRenderer } from '../Experience/Renderer'

type RendererInternals = {
  instance: ReturnType<typeof fakeRenderer>
  init: (adopted: AdoptedRenderer) => Promise<void>
  recoverFromDeviceLost: () => Promise<void>
  dispose: () => void
}

function fakeRenderer() {
  return {
    domElement: document.createElement('canvas'),
    dispose: vi.fn(),
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    backend: {},
  }
}

function makeRenderer(
  oldInstance: ReturnType<typeof fakeRenderer>,
  onInstanceReplaced: ReturnType<typeof vi.fn>,
) {
  return Object.assign(Object.create(Renderer.prototype), {
    instance: oldInstance,
    pipeline: { dispose: vi.fn() },
    sizes: { dpr: 1, width: 640, height: 480 },
    capabilities: {
      maxDpr: 1,
      setFinalRendererMode: vi.fn(),
    },
    postManager: { refreshQualityTier: vi.fn() },
    _pipelineConfig: {},
    _deviceLostAttempts: 0,
    _recovering: false,
    _disposed: false,
    _lifecycleGeneration: 0,
    _forceWebGL: false,
    _onInstanceReplaced: onInstanceReplaced,
    _onResize: vi.fn(),
  }) as unknown as RendererInternals
}

describe('Renderer device-loss lifecycle', () => {
  beforeEach(() => {
    mocks.create.mockReset()
    mocks.init.mockReset()
    mocks.inspect.mockReset()
    mocks.inspect.mockReturnValue({ backendName: 'WebGPU', isFallbackAdapter: false })
    mocks.plan.mockReset()
    mocks.plan.mockReturnValue({ recreate: false, mode: 'webgpu' })
    mocks.deviceLostAction.mockReset()
    mocks.deviceLostAction.mockReturnValue('recover')
    mocks.pipelineCreate.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.querySelectorAll('.renderer-unsupported').forEach((el) => el.remove())
  })

  it('adopts the SceneHost renderer without constructing a legacy canvas or backend', async () => {
    const adopted = fakeRenderer()
    const onInstanceReplaced = vi.fn()
    const renderer = makeRenderer(fakeRenderer(), onInstanceReplaced)

    await renderer.init({
      instance: adopted as unknown as AdoptedRenderer['instance'],
      canvas: adopted.domElement,
      mode: 'webgpu',
      onInstanceReplaced,
    })

    expect(renderer.instance).toBe(adopted)
    expect(adopted.setPixelRatio).toHaveBeenCalledWith(1)
    expect(adopted.setSize).toHaveBeenCalledWith(640, 480)
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.init).not.toHaveBeenCalled()
    expect(mocks.inspect).not.toHaveBeenCalled()
    expect(mocks.plan).not.toHaveBeenCalled()
  })

  it('disposes a late replacement instead of reviving after teardown', async () => {
    let resolveCreate!: (renderer: ReturnType<typeof fakeRenderer>) => void
    mocks.create.mockImplementationOnce(
      () => new Promise<ReturnType<typeof fakeRenderer>>((resolve) => (resolveCreate = resolve)),
    )
    mocks.init.mockResolvedValue(undefined)
    const oldInstance = fakeRenderer()
    const replacement = fakeRenderer()
    const onInstanceReplaced = vi.fn()
    const renderer = makeRenderer(oldInstance, onInstanceReplaced)

    const recovery = renderer.recoverFromDeviceLost()
    renderer.dispose()
    resolveCreate(replacement)
    await recovery

    expect(replacement.dispose).toHaveBeenCalledOnce()
    expect(onInstanceReplaced).not.toHaveBeenCalled()
  })

  it('does not surface a late recovery failure after teardown', async () => {
    let rejectCreate!: (error: Error) => void
    mocks.create.mockImplementationOnce(
      () =>
        new Promise<ReturnType<typeof fakeRenderer>>((_resolve, reject) => (rejectCreate = reject)),
    )
    mocks.init.mockResolvedValue(undefined)
    const renderer = makeRenderer(fakeRenderer(), vi.fn())
    const showUnsupported = vi.spyOn(
      renderer as unknown as { showUnsupportedMessage: () => void },
      'showUnsupportedMessage',
    )

    const recovery = renderer.recoverFromDeviceLost()
    renderer.dispose()
    rejectCreate(new Error('late recreation failed'))
    await recovery

    expect(showUnsupported).not.toHaveBeenCalled()
  })

  it('publishes a replacement when recovery is current without touching the loop (ADR 0005)', async () => {
    const oldInstance = fakeRenderer()
    const replacement = fakeRenderer()
    mocks.create.mockResolvedValueOnce(replacement)
    mocks.init.mockResolvedValue(undefined)
    const onInstanceReplaced = vi.fn()
    const renderer = makeRenderer(oldInstance, onInstanceReplaced)

    await renderer.recoverFromDeviceLost()

    expect(onInstanceReplaced).toHaveBeenCalledWith(replacement)
    // ADR 0005: the Tres-owned loop is instance-agnostic — the swap needs no
    // loop re-attachment (the deleted setAnimationLoop boundary stays gone).
    expect((replacement as unknown as Record<string, unknown>).setAnimationLoop).toBeUndefined()
  })

  it('disposes an installed replacement when post-swap setup fails', async () => {
    const oldInstance = fakeRenderer()
    const replacement = fakeRenderer()
    replacement.setSize.mockImplementationOnce(() => {
      throw new Error('replacement sizing failed')
    })
    mocks.create.mockResolvedValueOnce(replacement)
    mocks.init.mockResolvedValue(undefined)
    const emit = vi.spyOn(eventBus, 'emit')
    const renderer = makeRenderer(oldInstance, vi.fn())

    await renderer.recoverFromDeviceLost()

    const state = renderer as unknown as { _recoveryFailed: boolean }
    expect(replacement.dispose).toHaveBeenCalledOnce()
    expect(oldInstance.dispose).toHaveBeenCalledOnce()
    expect(state._recoveryFailed).toBe(true)
    expect(emit).toHaveBeenCalledWith('jlz:webgl-failed')
    document.querySelector('.renderer-unsupported')?.remove()
  })

  it('disposes the first fallback replacement exactly once when forced recreation fails', async () => {
    const oldInstance = fakeRenderer()
    const firstReplacement = fakeRenderer()
    const error = new Error('forced WebGL recreation failed')
    mocks.create.mockReturnValueOnce(firstReplacement).mockImplementationOnce(() => {
      throw error
    })
    mocks.init.mockResolvedValue(undefined)
    mocks.inspect.mockReturnValue({ backendName: 'WebGPU', isFallbackAdapter: true })
    mocks.plan.mockReturnValue({ recreate: true, mode: 'webgl' })
    const renderer = makeRenderer(oldInstance, vi.fn())

    await renderer.recoverFromDeviceLost()

    expect(firstReplacement.dispose).toHaveBeenCalledOnce()
    expect(document.querySelector('.renderer-unsupported')).not.toBeNull()
    document.querySelector('.renderer-unsupported')?.remove()
  })

  it('stops rendering and surfaces failure when recovery recreation fails', async () => {
    const oldInstance = fakeRenderer()
    const error = new Error('recreation failed')
    mocks.create.mockRejectedValueOnce(error)
    const renderer = makeRenderer(oldInstance, vi.fn())
    const emit = vi.spyOn(eventBus, 'emit')

    await renderer.recoverFromDeviceLost()

    const state = renderer as unknown as { _recoveryFailed: boolean }
    expect(state._recoveryFailed).toBe(true)
    expect(emit).toHaveBeenCalledWith('jlz:webgl-failed')
    expect(oldInstance.dispose).toHaveBeenCalledOnce()
    expect(() => {
      ;(renderer as unknown as { update: (...args: unknown[]) => void }).update({}, {}, 1 / 60)
    }).not.toThrow()
    expect(document.querySelector('.renderer-unsupported')).not.toBeNull()
    document.querySelector('.renderer-unsupported')?.remove()
  })

  it('keeps the setAnimationLoop boundary removed (ADR 0005)', () => {
    const instance = fakeRenderer()
    const renderer = makeRenderer(instance, vi.fn())

    // The renderer is no longer a loop owner: Experience drives the Tres loop
    // through the SceneHost port, so the old boundary method must stay gone.
    expect((renderer as unknown as Record<string, unknown>).setAnimationLoop).toBeUndefined()
  })

  it('stops the live loop when the device-loss recovery budget is exhausted', () => {
    mocks.deviceLostAction.mockReturnValueOnce('exhausted')
    const instance = Object.assign(fakeRenderer(), {
      onDeviceLost: vi.fn(),
    })
    const originalOnDeviceLost = instance.onDeviceLost
    const renderer = makeRenderer(instance, vi.fn())
    const emit = vi.spyOn(eventBus, 'emit')
    const showUnsupported = vi.spyOn(
      renderer as unknown as { showUnsupportedMessage: () => void },
      'showUnsupportedMessage',
    )
    ;(
      renderer as unknown as { attachDeviceLossRecovery: (value: unknown) => void }
    ).attachDeviceLossRecovery(instance)

    instance.onDeviceLost({ reason: 'lost' })

    const state = renderer as unknown as { _recoveryFailed: boolean }
    expect(state._recoveryFailed).toBe(true)
    expect(emit).toHaveBeenCalledWith('jlz:webgl-failed')
    expect(showUnsupported).toHaveBeenCalledOnce()
    expect(originalOnDeviceLost).toHaveBeenCalledOnce()
    document.querySelector('.renderer-unsupported')?.remove()
  })

  it('keeps the unsupported overlay idempotent and disposes its DOM owner', () => {
    const renderer = makeRenderer(fakeRenderer(), vi.fn())
    const showUnsupported = (renderer as unknown as { showUnsupportedMessage: () => void })
      .showUnsupportedMessage

    showUnsupported.call(renderer)
    showUnsupported.call(renderer)

    expect(document.querySelectorAll('.renderer-unsupported')).toHaveLength(1)
    renderer.dispose()
    expect(document.querySelector('.renderer-unsupported')).toBeNull()
    showUnsupported.call(renderer)
    expect(document.querySelector('.renderer-unsupported')).toBeNull()
    expect(() => renderer.dispose()).not.toThrow()
  })

  it('skips unused post parameter work on the WebGLBackend direct path', () => {
    const postUpdate = vi.fn()
    const updateParams = vi.fn()
    const render = vi.fn()
    const renderer = Object.assign(Object.create(Renderer.prototype), {
      _recovering: false,
      _recoveryFailed: false,
      _disposed: false,
      capabilities: { isRealWebGPU: false, scaleIntensity: vi.fn((value: number) => value) },
      postManager: { update: postUpdate, postParams: {} },
      pipeline: { updateParams, render },
      instance: { render },
    }) as unknown as Renderer

    renderer.update(new THREE.Scene(), new THREE.PerspectiveCamera(), 1 / 60)

    expect(postUpdate).not.toHaveBeenCalled()
    expect(updateParams).not.toHaveBeenCalled()
    expect(render).toHaveBeenCalledOnce()
  })

  it('hands the settled WebGPU post params straight to the pipeline every frame', () => {
    const postUpdate = vi.fn()
    const updateParams = vi.fn()
    const render = vi.fn()
    const params: PostParams = {
      bloom: 0.4,
      vignette: 0.5,
      grain: 0.25,
      chromatic: 0,
      bloomRadius: 0.6,
      bloomThreshold: 0.5,
      refract: 0.1,
      border: 0.2,
      gradeShadows: [0.9, 1, 1.1],
      gradeHighlights: [1, 0.95, 1.05],
    }
    const renderer = Object.assign(Object.create(Renderer.prototype), {
      _recovering: false,
      _recoveryFailed: false,
      _disposed: false,
      capabilities: { isRealWebGPU: true },
      postManager: { update: postUpdate, postParams: params },
      pipeline: { updateParams, render },
      instance: { render },
    }) as unknown as Renderer

    // Quality-tier intensity scaling is owned by PostProcessingManager
    // (applyPreset); the Renderer hands the crossfaded display values straight
    // to the pipeline. Dedup of identical values is RenderPipeline.updateParams'
    // own snapshot diff (pinned in RenderPipeline.lifecycle.test).
    renderer.update(new THREE.Scene(), new THREE.PerspectiveCamera(), 1 / 60)
    expect(updateParams).toHaveBeenCalledOnce()
    expect(updateParams).toHaveBeenCalledWith(params)

    renderer.update(new THREE.Scene(), new THREE.PerspectiveCamera(), 1 / 60)
    expect(postUpdate).toHaveBeenCalledTimes(2)
    expect(updateParams).toHaveBeenCalledTimes(2)

    params.bloom = 0.8
    renderer.update(new THREE.Scene(), new THREE.PerspectiveCamera(), 1 / 60)
    expect(updateParams).toHaveBeenCalledTimes(3)
    expect(updateParams).toHaveBeenLastCalledWith(params)
  })
})
