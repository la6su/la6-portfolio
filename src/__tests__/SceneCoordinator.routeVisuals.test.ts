import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SceneCoordinator } from '../Experience/SceneCoordinator'
import type { SceneCoordinatorOwners } from '../Experience/sceneOwners'
import {
  SplashCube,
  buildBakuShellGeometry,
  createBakuShellMaterial,
} from '../Experience/World/SplashCube'
import type { SectionGroups } from '../Experience/Scene/SectionGroups'
import { getLabExperiment, labExperiments } from '../Experience/Lab/manifest'
import type { PageId } from '../core/routeManifest'

const canvasContext = {
  fillStyle: '',
  globalAlpha: 1,
  fillRect: vi.fn(),
}

describe('SceneCoordinator route visuals (Phase 8 slice 10: the gate left `World`)', () => {
  let coordinator: SceneCoordinator
  let cube: SplashCube
  let getContext: ReturnType<typeof vi.spyOn>
  let page: PageId

  function makeOwners(baku: SplashCube): SceneCoordinatorOwners {
    return {
      ground: () => null,
      sectionGroups: () => null,
      envSphere: () => null,
      baku: () => baku,
      particleBurst: () => null,
      drawTrail: () => null,
      carousel: () => null,
      worksPlaneStage: () => null,
      contactTypographyStage: () => null,
      contactCyprusStage: () => null,
      contactHaloStage: () => null,
      manifestoInkStage: () => null,
      labGamepad: () => null,
      servicesStage: () => null,
    }
  }

  function makeBakuNodes() {
    const shell = new THREE.Mesh(buildBakuShellGeometry(), createBakuShellMaterial())
    const root = new THREE.Group()
    root.add(shell)
    return { root, shell }
  }

  beforeEach(() => {
    page = 'home'
    document.body.dataset.page = 'home'
    getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(canvasContext as unknown as CanvasRenderingContext2D)
    cube = new SplashCube(makeBakuNodes())
    coordinator = new SceneCoordinator(new THREE.Scene(), makeOwners(cube), () => page)
  })

  afterEach(() => {
    cube.dispose()
    getContext.mockRestore()
    delete document.body.dataset.page
  })

  it('admits only the lazy gamepad experiment for the Lab route', () => {
    expect(labExperiments.map((experiment) => experiment.id)).toEqual(['gamepad'])
    expect(getLabExperiment('lab')?.id).toBe('gamepad')
    expect(getLabExperiment('home')).toBeUndefined()
  })

  it('hides the shared cube on the Lab route', () => {
    page = 'lab'
    document.body.dataset.page = 'home'
    coordinator.syncRouteVisuals()
    expect(coordinator.baku).toBe(cube)
    expect(cube.visible).toBe(false)

    page = 'home'
    document.body.dataset.page = 'lab'
    coordinator.syncRouteVisuals()
    expect(cube.visible).toBe(true)
  })

  it('keeps the cube out of the standalone Works media route', () => {
    page = 'works'
    document.body.dataset.page = 'home'
    coordinator.syncRouteVisuals()
    expect(cube.visible).toBe(false)

    page = 'contact'
    document.body.dataset.page = 'works'
    coordinator.syncRouteVisuals()
    expect(cube.visible).toBe(true)
  })

  it('refreshes page-specific config caches when reinitialized', async () => {
    await coordinator.init()
    expect(coordinator.getConfig('sec_intro')).toBeDefined()

    page = 'works'
    await coordinator.init()

    expect(coordinator.getConfig('content_works_0')).toBeDefined()
    expect(coordinator.getConfig('sec_intro')).toBeUndefined()
    coordinator.dispose()
  })

  it('snapshots route and carousel owners once per transform pass', async () => {
    const pageReader = vi.fn(() => page)
    const carouselReader = vi.fn(() => null)
    const groups = Array.from({ length: 6 }, () => new THREE.Group())
    const owners: SceneCoordinatorOwners = {
      ground: () => null,
      sectionGroups: () => ({ groups }) as unknown as SectionGroups,
      envSphere: () => null,
      baku: () => null,
      particleBurst: () => null,
      drawTrail: () => null,
      carousel: carouselReader,
      worksPlaneStage: () => null,
      contactTypographyStage: () => null,
      contactCyprusStage: () => null,
      contactHaloStage: () => null,
      manifestoInkStage: () => null,
      labGamepad: () => null,
      servicesStage: () => null,
    }
    const isolated = new SceneCoordinator(new THREE.Scene(), owners, pageReader)
    await isolated.init()
    pageReader.mockClear()
    carouselReader.mockClear()

    isolated.updateTransform(0.2)

    expect(pageReader).toHaveBeenCalledOnce()
    expect(carouselReader).toHaveBeenCalledOnce()
    isolated.dispose()
  })

  it('reuses the pooled transform when story progress and route state are unchanged', async () => {
    const applyTransform = vi.fn()
    const isolated = new SceneCoordinator(
      new THREE.Scene(),
      {
        ...makeOwners(cube),
        ground: () => ({ applyTransform }) as never,
      },
      () => page,
    )
    await isolated.init()

    const first = isolated.updateTransform(0.2)
    const second = isolated.updateTransform(0.2)

    expect(second).toBe(first)
    expect(applyTransform).toHaveBeenCalledOnce()
    isolated.updateTransform(0.3)
    expect(applyTransform).toHaveBeenCalledTimes(2)
    isolated.dispose()
  })

  it('skips repeated section opacity writes when fade is unchanged', async () => {
    const groups = Array.from({ length: 6 }, () => new THREE.Group())
    const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6 })
    let opacity = material.opacity
    let writes = 0
    Object.defineProperty(material, 'opacity', {
      configurable: true,
      get: () => opacity,
      set: (value: number) => {
        writes++
        opacity = value
      },
    })
    groups[1]!.add(new THREE.Mesh(new THREE.BufferGeometry(), material))
    const owners: SceneCoordinatorOwners = {
      ground: () => null,
      sectionGroups: () => ({ groups }) as unknown as SectionGroups,
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
      labGamepad: () => null,
      servicesStage: () => null,
    }
    const isolated = new SceneCoordinator(new THREE.Scene(), owners, () => 'home')
    await isolated.init()
    isolated.updateTransform(0.2)
    const writesAfterFirstTransform = writes
    isolated.updateTransform(0.2)

    expect(writes).toBe(writesAfterFirstTransform)
    isolated.dispose()
    material.dispose()
  })
})
