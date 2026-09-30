import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Experience } from '../Experience/Experience'
import { SceneCoordinator } from '../Experience/SceneCoordinator'
import type { SceneCoordinatorOwners } from '../Experience/sceneOwners'
import { WorksPlaneStage } from '../Experience/World/WorksPlaneStage'
import { WorksInstallation } from '../Experience/World/WorksInstallation'
import type { PageId } from '../core/routeManifest'
import { getCurrentPage, setCurrentPage } from '../core/routePage'
import { seedExperience } from './experienceSeed'

// Phase 8 slice 7: the /works case-plane stage lifecycle (lazy creation +
// disposal) moved from World to Experience. Phase 8 slice 10: the `World`
// class leaves production — the stage is read through the SceneCoordinator's
// `worksPlaneStage` slot getter (Experience owns the field, the coordinator
// reads it). These methods are self-contained (they only touch the stage
// reference, the request guard, the scene + camera), so the test drives them
// on an Experience instance created without its heavy constructor (renderer
// capability detection, UI construction).

const canvasContext = {
  fillStyle: '',
  globalAlpha: 1,
  fillRect: vi.fn(),
}

describe('Experience works stage lifecycle', () => {
  let exp: Experience
  let coordinator: SceneCoordinator
  let registry: ReturnType<typeof seedExperience>['registry']
  let getContext: ReturnType<typeof vi.spyOn>

  /** Minimal state the two lifecycle methods touch (constructor bypassed). */
  function makeExperience(scene: THREE.Scene): Experience {
    const {
      exp,
      slots,
      registry: seededRegistry,
    } = seedExperience({
      scene,
      camera: { instance: new THREE.PerspectiveCamera() },
      _host: {
        stages: {
          works: {
            mountStage: vi.fn(async (stage: WorksPlaneStage) => scene.add(stage)),
            unmountStage: vi.fn(async (stage: WorksPlaneStage) => stage.removeFromParent()),
            mountInstallation: vi.fn(async () => undefined),
            unmountInstallation: vi.fn(async () => undefined),
          },
        },
      },
    })
    registry = seededRegistry
    // The coordinator reads the stage through an owner getter over the lazy
    // slot (the lazy stage changes identity per route — a stored reference
    // would go stale). Production wires this from within the constructor (the
    // `this` closure); the test reads the same live slot.
    const owners: SceneCoordinatorOwners = {
      ground: () => null,
      sectionGroups: () => null,
      envSphere: () => null,
      baku: () => null,
      particleBurst: () => null,
      drawTrail: () => null,
      carousel: () => null,
      worksPlaneStage: () => slots.worksPlane.getStage() as WorksPlaneStage | null,
      contactTypographyStage: () => null,
      contactCyprusStage: () => null,
      contactHaloStage: () => null,
      manifestoInkStage: () => null,
      labGamepad: () => null,
      servicesStage: () => null,
    }
    coordinator = new SceneCoordinator(scene, owners, () => getCurrentPage() as PageId)
    exp.coordinator = coordinator
    return exp
  }

  beforeEach(() => {
    setCurrentPage('works')
    getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(canvasContext as unknown as CanvasRenderingContext2D)
    exp = makeExperience(new THREE.Scene())
  })

  afterEach(() => {
    getContext.mockRestore()
    setCurrentPage('home')
  })

  it('releases a Works stage that finishes after the route was disposed', async () => {
    let resolveInit!: () => void
    const initPromise = new Promise<void>((resolve) => {
      resolveInit = resolve
    })
    const initSpy = vi.spyOn(WorksPlaneStage.prototype, 'init').mockReturnValue(initPromise)
    const disposeSpy = vi.spyOn(WorksPlaneStage.prototype, 'dispose')

    try {
      const pending = registry.ensureWorksPlaneStageInitialized()
      expect(coordinator.worksPlaneStage).toBeInstanceOf(WorksPlaneStage)

      // Let the Vue mount settle so this test exercises late init cleanup.
      await Promise.resolve()

      registry.disposeWorksPlaneStage()
      resolveInit()
      await pending

      // The first dispose detaches the field immediately; the second
      // catches textures/cards created by the in-flight init before it settled.
      expect(coordinator.worksPlaneStage).toBeNull()
      expect(disposeSpy).toHaveBeenCalledTimes(2)
    } finally {
      initSpy.mockRestore()
      disposeSpy.mockRestore()
    }
  })

  it('does not initialize a Works stage retired during its Vue mount', async () => {
    let finishMount!: () => void
    const stage = new THREE.Scene()
    exp = makeExperience(stage)
    const host = (
      exp as unknown as {
        _host: { stages: { works: { mountStage: ReturnType<typeof vi.fn> } } }
      }
    )._host.stages.works
    host.mountStage.mockImplementation(
      () => new Promise<void>((resolve) => (finishMount = resolve)),
    )
    const initSpy = vi.spyOn(WorksPlaneStage.prototype, 'init')
    const disposeSpy = vi.spyOn(WorksPlaneStage.prototype, 'dispose')

    try {
      const pending = registry.ensureWorksPlaneStageInitialized()
      expect(coordinator.worksPlaneStage).toBeInstanceOf(WorksPlaneStage)
      registry.disposeWorksPlaneStage()
      finishMount()
      await pending
      expect(initSpy).not.toHaveBeenCalled()
      expect(coordinator.worksPlaneStage).toBeNull()
      expect(disposeSpy).toHaveBeenCalledTimes(2)
    } finally {
      initSpy.mockRestore()
      disposeSpy.mockRestore()
    }
  })

  it('forwards the active /works stage into the coordinator frame path via the owner getter', async () => {
    const initSpy = vi.spyOn(WorksPlaneStage.prototype, 'init').mockImplementation(async function (
      this: WorksPlaneStage,
    ) {
      ;(this as unknown as { installation: WorksInstallation | null }).installation =
        new WorksInstallation()
    })
    const disposeSpy = vi.spyOn(WorksPlaneStage.prototype, 'dispose')

    try {
      const pending = registry.ensureWorksPlaneStageInitialized()
      await pending
      const stage = coordinator.worksPlaneStage
      expect(stage).toBeInstanceOf(WorksPlaneStage)
      const host = (
        exp as unknown as {
          _host: {
            stages: {
              works: {
                mountStage: ReturnType<typeof vi.fn>
                unmountStage: ReturnType<typeof vi.fn>
                mountInstallation: ReturnType<typeof vi.fn>
                unmountInstallation: ReturnType<typeof vi.fn>
              }
            }
          }
        }
      )._host.stages.works
      expect(host.mountStage).toHaveBeenCalledWith(stage)
      const installation = stage?.installationOwner
      expect(installation).toBeInstanceOf(WorksInstallation)
      expect(host.mountInstallation).toHaveBeenCalledWith(stage, installation)

      // Leaving /works disposes the owner and clears the field.
      setCurrentPage('home')
      registry.disposeWorksPlaneStage()
      expect(coordinator.worksPlaneStage).toBeNull()
      expect(host.unmountStage).toHaveBeenCalledWith(stage)
      expect(host.unmountInstallation).toHaveBeenCalledWith(stage, installation)
      expect(disposeSpy).toHaveBeenCalledTimes(1)
      expect(stage?.parent).toBeNull()
    } finally {
      initSpy.mockRestore()
      disposeSpy.mockRestore()
    }
  })
})
