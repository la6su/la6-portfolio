import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Experience } from '../Experience/Experience'
import { SceneCoordinator } from '../Experience/SceneCoordinator'
import type { SceneCoordinatorOwners } from '../Experience/sceneOwners'
import * as manifest from '../Experience/Lab/manifest'
import type { LabExperimentObject } from '../Experience/Lab/manifest'
import type { PageId } from '../core/routeManifest'
import { seedExperience } from './experienceSeed'

// Phase 8 slice 9: the Lab experiment object lifecycle (lazy creation on the
// first /lab visit + final disposal) moved from World to Experience. Phase 8
// slice 10: the `World` class leaves production — the object reaches the
// coordinator through the owners bag built over the StageRegistry slot, and
// the coordinator's `syncRouteVisuals` drives the visibility gate. 2026-09-25: the lifecycle
// flow itself moved onto the shared LazyStage contract (`ensureLazyStage` /
// `disposeLazyStage`) — the hand-rolled promise memoization + request counter
// left with it. The object is a static scene object (no per-frame update,
// resize or camera), so the test drives `ensureLabGamepad` on an Experience
// instance created without its heavy constructor (renderer capability
// detection, UI construction). (The final disposal on `destroy` is covered by
// the live gate's clean-disposal check, like the other slices.)

describe('Experience lab object lifecycle', () => {
  let exp: Experience
  let coordinator: SceneCoordinator
  let slots: ReturnType<typeof seedExperience>['slots']
  let registry: ReturnType<typeof seedExperience>['registry']
  let manifestSpy: ReturnType<typeof vi.spyOn>

  /** The ensured Lab object as the coordinator's owners bag sees it. */
  function slotStage(): LabExperimentObject | null {
    return slots.labGamepad.getStage() as LabExperimentObject | null
  }

  /** Minimal state the lifecycle method touches (constructor bypassed). */
  function makeExperience(scene: THREE.Scene): Experience {
    const seeded = seedExperience({
      scene,
      page: () => (document.body.dataset.page ?? 'home') as PageId,
    })
    const { exp, slots: registrySlots } = seeded
    slots = registrySlots
    registry = seeded.registry
    const owners: SceneCoordinatorOwners = {
      ground: () => null,
      sectionGroups: () => null,
      envSphere: () => null,
      baku: () => null,
      particleBurst: () => null,
      drawTrail: () => null,
      carousel: () => null,
      worksPlaneStage: () => null,
      contactTypographyStage: () => null,
      contactCyprusStage: () => null,
      contactHaloStage: () => null,
      manifestoInkStage: () => null,
      labGamepad: () => slots.labGamepad.getStage() as LabExperimentObject | null,
      servicesStage: () => null,
    }
    coordinator = new SceneCoordinator(
      scene,
      owners,
      () => (document.body.dataset.page ?? 'home') as PageId,
    )
    exp.coordinator = coordinator
    return exp
  }

  function mockExperiment(object: THREE.Object3D): void {
    vi.spyOn(manifest, 'getLabExperiment').mockReturnValue({
      id: 'gamepad',
      page: 'lab',
      load: () => Promise.resolve(object as never),
    } as never)
  }

  beforeEach(() => {
    document.body.dataset.page = 'lab'
    exp = makeExperience(new THREE.Scene())
    manifestSpy = vi.spyOn(manifest, 'getLabExperiment')
  })

  afterEach(() => {
    manifestSpy.mockRestore()
    delete document.body.dataset.page
  })

  it('loads one Lab object lazily and toggles its visibility through the coordinator gate', async () => {
    const object = new THREE.Group()
    object.name = 'lab-gamepad'
    mockExperiment(object)

    document.body.dataset.page = 'lab'
    await registry.ensureLabGamepad()

    // The registry slot feeds the coordinator's owners bag with the object.
    expect(slotStage()).toBe(object)
    expect(object.visible).toBe(true)
    // The object joined the Tres-owned scene through the declarative stage
    // port (SceneHost's Vue `<primitive>` slot; the seed double attaches to
    // the seeded scene the same way).
    expect(exp.scene.children).toContain(object)

    // Leaving /lab hides it via the coordinator's `syncRouteVisuals`.
    document.body.dataset.page = 'home'
    coordinator.syncRouteVisuals()
    expect(object.visible).toBe(false)

    // Idempotent: a second visit does not re-create the object.
    document.body.dataset.page = 'lab'
    await registry.ensureLabGamepad()
    expect(slotStage()).toBe(object)
  })

  it('is a no-op when the manifest has no experiment for the Lab route', async () => {
    vi.spyOn(manifest, 'getLabExperiment').mockReturnValue(undefined)

    document.body.dataset.page = 'lab'
    await registry.ensureLabGamepad()

    expect(slotStage()).toBeNull()
    expect(exp.scene.children).toHaveLength(0)
  })

  it('contains a failed load and allows a later retry', async () => {
    const object = new THREE.Group()
    let attempts = 0
    vi.spyOn(manifest, 'getLabExperiment').mockReturnValue({
      id: 'gamepad',
      page: 'lab',
      load: () => {
        attempts += 1
        return attempts === 1
          ? Promise.reject(new Error('fixture load failure'))
          : Promise.resolve(object as never)
      },
    } as never)

    await expect(registry.ensureLabGamepad()).resolves.toBeUndefined()
    expect(slotStage()).toBeNull()
    expect(exp.scene.children).not.toContain(object)

    await registry.ensureLabGamepad()
    expect(slotStage()).toBe(object)
    expect(attempts).toBe(2)
  })

  it('disposes a late load result after the owner is invalidated', async () => {
    let resolveLoad!: (object: LabExperimentObject) => void
    const pendingLoad = new Promise<LabExperimentObject>((resolve) => {
      resolveLoad = resolve
    })
    vi.spyOn(manifest, 'getLabExperiment').mockReturnValue({
      id: 'gamepad',
      page: 'lab',
      load: () => pendingLoad,
    } as never)

    const object = Object.assign(new THREE.Group(), {
      dispose: vi.fn(),
    }) as unknown as LabExperimentObject
    const loadPromise = registry.ensureLabGamepad()

    registry.disposeLabGamepad()
    resolveLoad(object)
    await loadPromise

    expect(object.dispose).toHaveBeenCalledTimes(1)
    expect(slotStage()).toBeNull()
    expect(exp.scene.children).not.toContain(object)
  })
})
