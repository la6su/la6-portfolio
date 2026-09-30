import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'

const manifestoModule = vi.hoisted(() => {
  let resolve!: (value: unknown) => void
  const promise = new Promise<unknown>((done) => {
    resolve = done
  })

  return { resolve, promise }
})

vi.mock('../Experience/World/ManifestoInkStage', () => manifestoModule.promise)

import { seedExperience } from './experienceSeed'

class DeferredManifestoInkStage extends THREE.Group {
  static constructed = vi.fn()
  readonly dispose = vi.fn()
  readonly setTheme = vi.fn()
  readonly setReducedMotion = vi.fn()
  readonly setActive = vi.fn()

  constructor() {
    super()
    DeferredManifestoInkStage.constructed()
  }
}

function makeDestroyableExperience(scene: THREE.Scene): ReturnType<typeof seedExperience> {
  return seedExperience({
    _destroyed: false,
    _lifecycleGeneration: 0,
    _scheduler: { destroy: vi.fn() },
    _mouseTrailRafId: null,
    _mouseTrailRafPending: false,
    _onMouseMoveForTrail: null,
    _readinessGate: null,
    features: { destroy: vi.fn() },
    renderer: { dispose: vi.fn() },
    camera: { destroy: vi.fn() },
    sizes: { destroy: vi.fn() },
    sfx: { dispose: vi.fn() },
    scene,
    _host: {
      stages: {
        manifestoInk: {
          unmount: vi.fn(async (stage: THREE.Object3D) => {
            stage.removeFromParent()
          }),
        },
      },
    },
  })
}

describe('Experience Manifesto ink lazy owner', () => {
  it('retires a pending import during root teardown before it can construct or attach', async () => {
    const scene = new THREE.Scene()
    const { exp: experience, slots, registry } = makeDestroyableExperience(scene)

    const pending = registry.ensureManifestoInkStageInitialized()
    experience.destroy()
    manifestoModule.resolve({ ManifestoInkStage: DeferredManifestoInkStage })
    await pending

    expect(DeferredManifestoInkStage.constructed).not.toHaveBeenCalled()
    expect(scene.children).toHaveLength(0)
    expect(slots.manifestoInk.getStage()).toBeNull()
    expect(slots.manifestoInk.owner.getPromise()).toBeNull()
  })

  it('disposes a live ink stage during root teardown', () => {
    const scene = new THREE.Scene()
    const stage = new DeferredManifestoInkStage()
    scene.add(stage)
    const { exp: experience, slots } = makeDestroyableExperience(scene)
    slots.manifestoInk.setStage(stage)

    experience.destroy()

    expect(stage.dispose).toHaveBeenCalledOnce()
    expect(stage.parent).toBeNull()
  })
})
