import { describe, expect, it, beforeEach, vi } from 'vitest'
import * as THREE from 'three'
import type { SceneHostReady } from '../app/sceneHost'

type SceneHostModule = typeof import('../app/sceneHost')
type Bridge = SceneHostModule['sceneHost']

/**
 * The sceneHost bridge is module-scoped (one Tres root per page). Tests use
 * `vi.resetModules()` + dynamic import + the test-only reset so every case
 * starts from the pristine one-shot state.
 */
async function freshBridge(): Promise<{ mod: SceneHostModule; bridge: Bridge }> {
  vi.resetModules()
  const mod = await import('../app/sceneHost')
  mod.__resetSceneHostForTests()
  return { mod, bridge: mod.sceneHost }
}

function fakeReady(overrides?: Partial<SceneHostReady>): SceneHostReady {
  const context = {
    scene: { value: { isScene: true } },
    renderer: { instance: { name: 'old' } },
  } as unknown as SceneHostReady['context']
  const canvas = document.createElement('canvas')
  return {
    scene: new THREE.Scene(),
    context,
    renderer: {} as SceneHostReady['renderer'],
    canvas,
    camera: new THREE.PerspectiveCamera(),
    mode: 'webgpu',
    backend: { backendName: 'WebGPUBackend', isFallbackAdapter: false },
    lights: {} as SceneHostReady['lights'],
    ground: {} as SceneHostReady['ground'],
    sectionRoots: [],
    servicesStage: {} as SceneHostReady['servicesStage'],
    envSphere: {} as SceneHostReady['envSphere'],
    baku: {} as SceneHostReady['baku'],
    introFrames: {} as SceneHostReady['introFrames'],
    cursorTrail: {} as SceneHostReady['cursorTrail'],
    loop: {
      onFrame: () => undefined,
      start: () => undefined,
      stop: () => undefined,
      onExternalInvalidate: () => () => undefined,
    },
    stages: {
      works: {
        mountStage: async () => undefined,
        unmountStage: async () => undefined,
        mountInstallation: async () => undefined,
        unmountInstallation: async () => undefined,
      },
      contactHalo: { mount: async () => undefined, unmount: async () => undefined },
      manifestoInk: { mount: async () => undefined, unmount: async () => undefined },
      contactTypography: { mount: async () => undefined, unmount: async () => undefined },
      contactCyprus: { mount: async () => undefined, unmount: async () => undefined },
      labGamepad: { mount: async () => undefined, unmount: async () => undefined },
    },
    ...overrides,
  }
}

describe('sceneHost bridge (Phase 7 persistent Tres root)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts unsettled with a pending ready promise', async () => {
    const { bridge } = await freshBridge()
    expect(bridge.isSettled).toBe(false)
    expect(bridge.ready instanceof Promise).toBe(true)
  })

  it('recreates an isolated pending promise when the test reset runs', async () => {
    const { mod, bridge } = await freshBridge()
    const firstReady = bridge.ready
    bridge.resolve(fakeReady())
    await expect(firstReady).resolves.toBeDefined()

    mod.__resetSceneHostForTests()

    expect(bridge.isSettled).toBe(false)
    expect(bridge.ready).not.toBe(firstReady)
    const pending = bridge.ready
    bridge.resolve(fakeReady({ mode: 'webgl' }))
    await expect(pending).resolves.toMatchObject({ mode: 'webgl' })
  })

  it('settles exactly once — a second resolve is a no-op', async () => {
    const { bridge } = await freshBridge()
    const first = fakeReady()
    bridge.resolve(first)
    expect(bridge.isSettled).toBe(true)
    await expect(bridge.ready).resolves.toBe(first)
    // A second settlement attempt (e.g. a duplicate Tres ready event) must
    // not re-settle or change the published value.
    bridge.resolve(fakeReady({ mode: 'webgl' }))
    await expect(bridge.ready).resolves.toBe(first)
    expect(bridge.isSettled).toBe(true)
  })

  it('rejects once and rejects the ready promise', async () => {
    const { bridge } = await freshBridge()
    const error = new Error('renderer init failed')
    bridge.reject(error)
    expect(bridge.isSettled).toBe(true)
    await expect(bridge.ready).rejects.toBe(error)
    // A late resolve after rejection is a no-op.
    bridge.resolve(fakeReady())
    await expect(bridge.ready).rejects.toBe(error)
  })

  it('replaceRenderer swaps the live instance on the Tres context', async () => {
    const { bridge } = await freshBridge()
    const oldRenderer = { name: 'old' } as unknown as SceneHostReady['renderer']
    const newRenderer = { name: 'new' } as unknown as SceneHostReady['renderer']
    const ready = fakeReady({
      context: {
        scene: { value: {} },
        renderer: { instance: oldRenderer },
      } as unknown as SceneHostReady['context'],
    })
    // No context yet — the swap is a no-op and never throws.
    bridge.replaceRenderer(newRenderer)
    expect(ready.context.renderer.instance).toBe(oldRenderer)
    bridge.resolve(ready)
    // After settlement the device-loss recovery sync lands on the live ctx.
    bridge.replaceRenderer(newRenderer)
    expect(ready.context.renderer.instance).toBe(newRenderer)
  })

  it('notifies the host-owned renderer slot after recovery', async () => {
    const { bridge } = await freshBridge()
    const ready = fakeReady()
    const replacement = { name: 'replacement' } as unknown as SceneHostReady['renderer']
    bridge.resolve(ready)
    const onReplacement = vi.fn()
    const unbind = bridge.bindRendererOwner(onReplacement)

    bridge.replaceRenderer(replacement)

    expect(onReplacement).toHaveBeenCalledOnce()
    expect(onReplacement).toHaveBeenCalledWith(replacement)
    unbind()
    bridge.replaceRenderer(ready.renderer)
    expect(onReplacement).toHaveBeenCalledOnce()
  })
})
