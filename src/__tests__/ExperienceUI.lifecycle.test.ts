import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ExperienceUI, type ExperienceUIHost } from '../Experience/ExperienceUI'
import { eventBus } from '../core/EventBus'
import type { PageId } from '../core/routeManifest'

const createHost = (sections: unknown[], carousel: unknown = null): ExperienceUIHost => {
  return {
    page: () => 'home',
    coordinator: () =>
      ({
        sections,
        carousel,
        refreshRouteConfig: vi.fn(async () => undefined),
        syncRouteVisuals: vi.fn(),
        setContactSceneSection: vi.fn(),
      }) as never,
    camera: () => ({ instance: {} }) as never,
    ui: () => ({ overlay: {} }) as never,
    sfx: () => ({}) as never,
    raise: vi.fn(),
    reducedMotion: () => false,
    ensureCarouselInitialized: vi.fn(async () => undefined),
    stages: () =>
      ({
        ensureWorksPlaneStageInitialized: vi.fn(async () => undefined),
        disposeWorksPlaneStage: vi.fn(),
        ensureContactTypographyStageInitialized: vi.fn(async () => undefined),
        ensureContactCyprusStageInitialized: vi.fn(async () => undefined),
        ensureContactHaloStageInitialized: vi.fn(async () => undefined),
        ensureManifestoInkStageInitialized: vi.fn(async () => undefined),
        disposeManifestoInkStage: vi.fn(),
        disposeContactTypographyStage: vi.fn(),
        disposeContactCyprusStage: vi.fn(),
        disposeContactHaloStage: vi.fn(),
        setContactCyprusStageSection: vi.fn(),
        ensureLabGamepad: vi.fn(async () => undefined),
      }) as never,
  }
}

describe('ExperienceUI project controls lifecycle', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('does not create project controls after destroy during deferred scene readiness', async () => {
    const callbacks: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callbacks.push(callback)
      return callbacks.length
    })
    const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame')
    const sections: unknown[] = []
    const host = createHost(sections)
    const experienceUI = new ExperienceUI(host)
    const pending = experienceUI.ensureProjectControls()

    experienceUI.destroy()
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1)
    sections.push({})
    callbacks[0]!(0)
    await pending

    expect(experienceUI.overlay).toBeNull()
  })

  it('creates project controls once when the scene is already ready', async () => {
    const experienceUI = new ExperienceUI(createHost([{}]))

    await experienceUI.ensureProjectControls()
    const overlay = experienceUI.overlay
    await experienceUI.ensureProjectControls()

    expect(overlay).not.toBeNull()
    expect(experienceUI.overlay).toBe(overlay)
    experienceUI.destroy()
  })

  it('coalesces concurrent project-control initialization requests', async () => {
    const callbacks: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callbacks.push(callback)
      return callbacks.length
    })
    const sections: unknown[] = []
    const experienceUI = new ExperienceUI(createHost(sections))
    const first = experienceUI.ensureProjectControls()
    const second = experienceUI.ensureProjectControls()

    expect(first).toBe(second)
    callbacks[0]!(0)
    await first

    expect(experienceUI.overlay).toBeNull()
    sections.push({})
    await experienceUI.ensureProjectControls()
    expect(experienceUI.overlay).not.toBeNull()
  })

  it('wakes the render demand after fullscreen project navigation', async () => {
    const prev = vi.fn()
    const next = vi.fn()
    const raise = vi.fn()
    const carousel = { prev, next, setCamera: vi.fn(), onCardClick: vi.fn(() => vi.fn()) }
    const host = {
      ...createHost([{}], carousel),
      raise,
      sfx: () => ({ setMuted: vi.fn() }) as never,
    }
    const experienceUI = new ExperienceUI(host)
    experienceUI.init()
    await experienceUI.ensureProjectControls()
    experienceUI.overlay = { isOpen: true } as never
    const select = vi.spyOn(experienceUI, 'onProjectSelect').mockImplementation(() => undefined)

    eventBus.emit('jlz:project-navigate', { direction: 1 })

    expect(next).toHaveBeenCalledOnce()
    expect(select).toHaveBeenCalledWith(1)
    expect(raise).toHaveBeenCalledWith('nav')
    experienceUI.destroy()
  })

  it('wires the home carousel after direct content entry and releases its callback', async () => {
    const unwire = vi.fn()
    const carousel = {
      setCamera: vi.fn(),
      onCardClick: vi.fn(() => unwire),
    }
    const host = {
      ...createHost([{}], carousel),
      page: () => 'works' as const,
    }
    const first = new ExperienceUI(host)
    await first.ensureProjectControls()

    expect(carousel.onCardClick).toHaveBeenCalledOnce()
    first.destroy()
    expect(unwire).toHaveBeenCalledOnce()

    const second = new ExperienceUI(host)
    await second.ensureProjectControls()
    expect(carousel.onCardClick).toHaveBeenCalledTimes(2)
    second.destroy()
  })

  it('refreshes page-specific scene config before route owner reconciliation', async () => {
    const refreshRouteConfig = vi.fn(async () => undefined)
    const syncRouteVisuals = vi.fn()
    let page: PageId = 'home'
    const host = {
      ...createHost([{}]),
      page: () => page,
      sfx: () => ({ setMuted: vi.fn() }) as never,
      coordinator: () =>
        ({
          sections: [{}],
          refreshRouteConfig,
          syncRouteVisuals,
          setContactSceneSection: vi.fn(),
          setWorksPlaneStageSection: vi.fn(),
        }) as never,
    }
    const experienceUI = new ExperienceUI(host)
    experienceUI.init()

    page = 'works'
    eventBus.emit('jlz:route-change', { page })
    await Promise.resolve()
    await Promise.resolve()

    expect(refreshRouteConfig).toHaveBeenCalledOnce()
    expect(syncRouteVisuals).toHaveBeenCalledOnce()
    expect(refreshRouteConfig.mock.invocationCallOrder[0]).toBeLessThan(
      syncRouteVisuals.mock.invocationCallOrder[0]!,
    )
    experienceUI.destroy()
  })

  it('contains a live route reconciliation failure without an unhandled rejection', async () => {
    const error = new Error('fixture route refresh failure')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let page: PageId = 'home'
    const host = {
      ...createHost([{}]),
      page: () => page,
      sfx: () => ({ setMuted: vi.fn() }) as never,
      coordinator: () =>
        ({
          sections: [{}],
          refreshRouteConfig: vi.fn().mockRejectedValue(error),
          syncRouteVisuals: vi.fn(),
        }) as never,
    }
    const experienceUI = new ExperienceUI(host)
    experienceUI.init()

    page = 'works'
    eventBus.emit('jlz:route-change', { page })
    await Promise.resolve()
    await Promise.resolve()

    expect(errorSpy).toHaveBeenCalledWith('[ExperienceUI] route reconciliation failed:', error)
    errorSpy.mockRestore()
    experienceUI.destroy()
  })

  it('routes visual Works taps through the stage owner and wakes its pulse', async () => {
    const raise = vi.fn()
    const openProject = vi.fn((_index: number, open: (index: number) => void) => {
      open(0)
      return true
    })
    const host = {
      ...createHost([{}]),
      page: () => 'works' as const,
      raise,
      sfx: () => ({ setMuted: vi.fn() }) as never,
      coordinator: () =>
        ({ sections: [{}], worksPlaneStage: { hitTest: () => 0, openProject } }) as never,
    }
    const experienceUI = new ExperienceUI(host)
    experienceUI.init()
    await experienceUI.ensureProjectControls()
    experienceUI.overlay = { isOpen: false, open: vi.fn() } as never

    document.body.dispatchEvent(
      new PointerEvent('pointerup', { bubbles: true, clientX: 20, clientY: 20 }),
    )
    await Promise.resolve()
    await Promise.resolve()

    expect(openProject).toHaveBeenCalledOnce()
    expect(raise).toHaveBeenCalledWith('dirty')
    experienceUI.destroy()
  })
})
