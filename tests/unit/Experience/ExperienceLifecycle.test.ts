import { beforeEach, describe, expect, it, vi } from 'vitest'

const lifecycle = vi.hoisted(() => ({
  mountCarousel: vi.fn(),
  mountParticles: vi.fn(),
  carouselInit: vi.fn(),
  coordinatorInit: vi.fn(),
  coordinatorReducedMotion: vi.fn(),
  prewarmHomeMedia: vi.fn(),
  reconcileRoute: vi.fn(),
  createdOwners: [] as string[],
  makeOwner: (name: string) =>
    class {
      constructor() {
        lifecycle.createdOwners.push(name)
      }
      dispose = vi.fn()
      setReducedMotion = vi.fn()
    },
}))

vi.mock('./Input', () => ({ input: { destroy: vi.fn(), start: vi.fn() } }))

vi.mock('./SceneCoordinator', () => ({
  SceneCoordinator: class {
    sections = []
    currentSectionIndex = 1
    init = lifecycle.coordinatorInit
    setReducedMotion = lifecycle.coordinatorReducedMotion
    prewarmHomeMedia = lifecycle.prewarmHomeMedia
    getConfig = vi.fn(() => undefined)
    dispose = vi.fn()
  },
}))

vi.mock('./Scene/SectionGroups', () => ({
  SectionGroups: class {
    works = {
      carousel: {
        onActivity: null,
        init: lifecycle.carouselInit,
        setReducedMotion: vi.fn(),
      },
      particles: { setBlending: vi.fn() },
    }
    dispose = vi.fn()
  },
}))

vi.mock('./World/SplashCube', () => ({
  SplashCube: lifecycle.makeOwner('baku'),
}))
vi.mock('./World/ParticleBurst', () => ({
  ParticleBurst: lifecycle.makeOwner('particle-burst'),
}))
vi.mock('./World/DrawTrail', () => ({
  DrawTrail: lifecycle.makeOwner('draw-trail'),
}))
vi.mock('./World/Lights', () => ({
  CinematicLights: lifecycle.makeOwner('lights'),
}))
vi.mock('./Scene/GroundPlane', () => ({
  GroundPlane: lifecycle.makeOwner('ground'),
}))

import { Experience } from '../../../src/Experience/Experience'

function createExperienceHarness(page = 'home'): {
  buildScene: (token: number) => Promise<void>
  destroy: () => Promise<void>
} {
  const instance = Object.assign(Object.create(Experience.prototype) as object, {
    _destroyed: false,
    _reducedMotion: false,
    _lifecycleGeneration: 0,
    _host: {
      page: () => page,
      sectionRoots: [],
      servicesStage: {},
      envSphere: { setReducedMotion: vi.fn() },
      baku: {},
      introFrames: {},
      cursorTrail: {},
      lights: {},
      ground: {},
      stages: {
        carousel: { mount: lifecycle.mountCarousel },
        particles: { mount: lifecycle.mountParticles },
      },
    },
    scene: {},
    _stages: {
      dispose: vi.fn(async () => undefined),
      reconcileRoute: lifecycle.reconcileRoute,
      setReducedMotion: vi.fn(),
    },
    renderer: { instance: {}, dispose: vi.fn() },
    camera: { instance: {}, destroy: vi.fn() },
    _scheduler: { destroy: vi.fn() },
    _showreel: { dispose: vi.fn(async () => undefined) },
    features: { destroy: vi.fn() },
    sfx: { dispose: vi.fn() },
    _environment: { disposeCurrent: vi.fn() },
    _cancelBreath: vi.fn(),
    sectionGroups: null,
    devPanel: null,
    _stopSizeWatch: null,
  }) as unknown as {
    buildScene: (token: number) => Promise<void>
    destroy: () => Promise<void>
  }
  return instance
}

describe('Experience scene construction cancellation', () => {
  beforeEach(() => {
    lifecycle.mountCarousel.mockReset().mockResolvedValue(undefined)
    lifecycle.mountParticles.mockReset().mockResolvedValue(undefined)
    lifecycle.carouselInit.mockReset().mockResolvedValue(undefined)
    lifecycle.coordinatorInit.mockReset().mockResolvedValue(undefined)
    lifecycle.coordinatorReducedMotion.mockReset()
    lifecycle.prewarmHomeMedia.mockReset().mockResolvedValue(undefined)
    lifecycle.reconcileRoute.mockReset().mockResolvedValue(undefined)
    lifecycle.createdOwners.length = 0
  })

  it('does not create boot controllers after a pending carousel mount is retired', async () => {
    let finishMount!: () => void
    lifecycle.mountCarousel.mockImplementationOnce(
      () => new Promise<void>((resolve) => (finishMount = resolve)),
    )
    const experience = createExperienceHarness()

    const build = experience.buildScene(0)
    expect(lifecycle.mountCarousel).toHaveBeenCalledOnce()

    const teardown = experience.destroy()
    finishMount()

    await expect(build).resolves.toBeUndefined()
    await teardown
    expect(lifecycle.mountParticles).not.toHaveBeenCalled()
    expect(lifecycle.createdOwners).toEqual([])
  })

  it('does not create boot controllers after a pending particle mount is retired', async () => {
    let finishMount!: () => void
    lifecycle.mountParticles.mockImplementationOnce(
      () => new Promise<void>((resolve) => (finishMount = resolve)),
    )
    const experience = createExperienceHarness()

    const build = experience.buildScene(0)
    await vi.waitFor(() => expect(lifecycle.mountParticles).toHaveBeenCalledOnce())

    const teardown = experience.destroy()
    finishMount()

    await expect(build).resolves.toBeUndefined()
    await teardown
    expect(lifecycle.createdOwners).toEqual([])
  })

  it('does not prewarm home media after a pending carousel initialization is retired', async () => {
    let finishInit!: () => void
    lifecycle.carouselInit.mockImplementationOnce(
      () => new Promise<void>((resolve) => (finishInit = resolve)),
    )
    const experience = createExperienceHarness()

    const build = experience.buildScene(0)
    await vi.waitFor(() => expect(lifecycle.carouselInit).toHaveBeenCalledOnce())

    const teardown = experience.destroy()
    finishInit()

    await expect(build).resolves.toBeUndefined()
    await teardown
    expect(lifecycle.prewarmHomeMedia).not.toHaveBeenCalled()
  })

  it('keeps scene owners and renderer alive until an in-flight GPU prewarm settles', async () => {
    let finishPrewarm!: () => void
    lifecycle.prewarmHomeMedia.mockImplementationOnce(
      () => new Promise<void>((resolve) => (finishPrewarm = resolve)),
    )
    const experience = createExperienceHarness()
    const runtime = experience as unknown as {
      renderer: { dispose: () => void }
      _stages: { dispose: () => Promise<void> }
    }
    const rendererDispose = vi.spyOn(runtime.renderer, 'dispose')
    const stageDispose = vi.spyOn(runtime._stages, 'dispose')

    const initialization = experience.buildScene(0)
    await vi.waitFor(() => expect(lifecycle.prewarmHomeMedia).toHaveBeenCalledOnce())
    expect(lifecycle.coordinatorReducedMotion).toHaveBeenCalledWith(false)
    expect(lifecycle.reconcileRoute).toHaveBeenCalledOnce()
    expect(lifecycle.reconcileRoute).toHaveBeenCalledWith('home')

    const teardown = experience.destroy()
    expect(rendererDispose).not.toHaveBeenCalled()
    expect(stageDispose).not.toHaveBeenCalled()

    finishPrewarm()
    await Promise.all([initialization, teardown])

    expect(rendererDispose).toHaveBeenCalledOnce()
    expect(stageDispose).toHaveBeenCalledOnce()
  })
})
