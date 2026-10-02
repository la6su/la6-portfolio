// Owns the cinematic navigation, menu, fullscreen overlay, project controls
// and their UI-facing event handlers. It receives the scene owners it uses,
// without reaching into the renderer or scene graph.
//
// Disposal contract: `destroy()` removes every window listener this class
// added and disposes the features it created — Experience.destroy() runs it
// so the root teardown returns every owned resource to baseline.

import { CinematicNav } from '../UI/CinematicNav'
import { FullscreenOverlay } from '../UI/FullscreenOverlay'
import type { StageRegistry } from './StageRegistry'
import type { PageId } from '../core/routeManifest'
import { getSoundMuted } from '../core/SfxSystem'
import type { SfxSystem } from '../core/SfxSystem'
import { eventBus } from '../core/EventBus'
import type { Camera } from './Camera'
import type { FrameReason } from '../core/RenderScheduler'
import { PROJECTS } from '../Data/Projects'
import type { SplashCube } from './World/SplashCube'
import type { ParticleBurst } from './World/ParticleBurst'
import type { BakuCarousel } from './World/BakuCarousel'

/**
 * Scene owners are passed after buildScene() has completed. Only route state,
 * render demand, and initialization remain callbacks because they can change
 * or are actions rather than owned objects.
 */
export interface ExperienceUIHost {
  page: () => PageId
  baku: SplashCube
  particleBurst: ParticleBurst
  carousel: BakuCarousel | null
  camera: Camera
  sfx: SfxSystem
  /** Raise render demand + wake the single loop driver (typed reason). */
  raise: (reason?: FrameReason) => void
  reducedMotion: () => boolean
  /** The one owner of route stages, read only after Experience initializes. */
  stages: StageRegistry
}

export class ExperienceUI {
  /** Vertical native story track plus top/bottom sheets. */
  storyNav: CinematicNav | null = null
  /** Behavior controller for the Vue-owned fullscreen overlay. */
  overlay: FullscreenOverlay | null = null
  private activeProjectIndex = 0
  private _unwireCarousel: (() => void) | null = null

  private readonly _unsubs: Array<() => void> = []
  private _overlayHostUnsub: (() => void) | null = null
  private _worksPlaneTapHandler: ((e: PointerEvent) => void) | null = null
  private _projectOverlayPreloaded = false
  private _destroyed = false

  constructor(private host: ExperienceUIHost) {}

  /** Create + wire the UI features. Called from Experience.init(). */
  init(): void {
    this._overlayHostUnsub = eventBus.on('jlz:fullscreen-overlay-unmounted', () => {
      this.overlay?.dispose()
      this.overlay = null
      this._unwireCarousel?.()
      this._unwireCarousel = null
    })

    // CinematicNav owns navigation over the canonical world-slot track.
    this.storyNav = new CinematicNav(this.host.page)
    // Native scroll wakes the shared render loop.
    this.storyNav.onActivity = () => {
      this.host.raise('nav')
    }
    this.storyNav.onSectionChange((idx) => {
      eventBus.emit('jlz:story-index-change', { index: idx })
      this.host.raise('nav')
    })
    this.storyNav.onActiveChange((active) => {
      if (active) this.host.raise('nav')
    })

    this._unsubs.push(
      eventBus.on('jlz:story-navigate', ({ index }) => {
        this.storyNav?.goToSection(index)
      }),
    )

    // Sound config from splash page (localStorage 'jlz:sound' = 'on'|'off').
    // D-7 fix: default to MUTED (matches the console's getSoundMuted default:
    // `localStorage.getItem('jlz:sound') !== 'on'` → true/muted when no key).
    this.host.sfx.setMuted(getSoundMuted())

    // Runtime sound toggle from the persistent console or other in-app controls.
    this._unsubs.push(
      eventBus.on('jlz:sound-toggle', ({ muted }) => {
        this.host.sfx.setMuted(muted)
      }),
    )

    // ── Semantic project control → open fullscreen overlay ──
    // Works and case-study Vue views emit this port from their native controls.
    // All opens (showreel, slider, /works) use the same unified DOM cinematic
    // reveal — no 3D plane-to-fullscreen handoff, which caused a double effect.
    this._unsubs.push(
      eventBus.on('jlz:open-project', ({ idx }) => {
        if (typeof idx !== 'number') return
        this.ensureProjectControls()
        this.onProjectSelect(idx)
      }),
    )

    this._unsubs.push(
      eventBus.on('jlz:project-navigate', ({ direction }) => {
        if (!this.overlay?.isOpen) return
        this.navigateProject(direction)
      }),
    )

    // The fullscreen poster belongs to this UI owner. Warm it on the first
    // home Works arrival instead of checking overlay state on every scene frame.
    this._unsubs.push(
      eventBus.on('jlz:section-change', ({ configId }) => {
        if (
          configId !== 'sec_works' ||
          this.host.page() !== 'home' ||
          this._projectOverlayPreloaded
        ) {
          return
        }
        this.ensureProjectControls()
        if (!this.overlay) return
        this._projectOverlayPreloaded = true
        this.onProjectSelect(0, true)
      }),
    )

    // ── Close overlay on route change ──
    // Scene route reconciliation belongs to Experience; this UI owner only
    // closes its Vue-owned overlay when navigation changes.
    this._unsubs.push(
      eventBus.on('jlz:route-change', () => {
        if (this.overlay?.isOpen) {
          this.overlay.close()
        }
      }),
    )

    // Wobble pulse on card click (work cards + carousel).
    this._unsubs.push(
      eventBus.on('jlz:wobble-pulse', () => {
        this.host.baku.triggerWobblePulse()
        // Keep rendering while the pulse animates (sin-envelope in SplashCube.update).
        this.host.raise('dirty')
      }),
    )

    this._worksPlaneTapHandler = (e: PointerEvent) => {
      if (this.host.page() !== 'works' || this.overlay?.isOpen) return
      // The Enter pointerup is dispatched while the splash curtains are still
      // present. It must not be reinterpreted as a click on the first 3D plane.
      if (document.getElementById('jlz-app-loader')) return
      const target = e.target as HTMLElement | null
      if (
        target?.closest(
          '.jlz-works-aperture, .jlz-works-actions, #jlz-fs-overlay, .jlz-topbar, [data-cinematic-menu]',
        )
      )
        return
      // Raycast against the 3D planes to find which project was tapped, then
      // open the overlay with the unified cinematic reveal (no 3D handoff).
      this.ensureProjectControls()
      const stage = this.host.stages.worksPlaneStage
      if (!stage) return
      const idx = stage.hitTest(e.clientX, e.clientY)
      if (
        idx >= 0 &&
        stage.openProject(idx, (projectIndex) => this.onProjectSelect(projectIndex))
      ) {
        // The visual plane owns the wobble pulse; wake the shared loop so
        // the pulse receives frames after an idle touch/pointer tap.
        this.host.raise('dirty')
      }
    }
    window.addEventListener('pointerup', this._worksPlaneTapHandler)

    // ── Hash navigation from menu overlay (e.g. /manifesto#section-manifesto-clarity) ──
    // Dispatched by the router after renderView. CinematicNav finds
    // the target section by hash ID and activates it. Without this, menu
    // subsection clicks always land on section 1 (hash silently dropped).
    this._unsubs.push(
      eventBus.on('jlz:goto-section-by-hash', ({ hash }) => {
        if (hash) {
          this.storyNav?.goToSectionByHash(hash)
        }
      }),
    )
  }

  /** Start the authored cube reaction and its one-shot portal-frame echo. */
  triggerSplashOpener(): void {
    this.host.baku.triggerOpener()
    if (this.host.reducedMotion()) return
    const particleBurst = this.host.particleBurst
    particleBurst.trigger(0, 0, 0)
    if (particleBurst.isActive) this.host.raise('dirty')
  }

  ensureProjectControls(): void {
    if (this.overlay || this._destroyed) return
    try {
      this.initializeProjectControls()
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[ExperienceUI] project controls init failed:', error)
      }
    }
  }

  private initializeProjectControls(): void {
    if (this.overlay || this._destroyed) return
    // Always prepare project controls — single-page experience.
    // Experience calls this after buildScene(), before
    // any user controls can emit project-selection events.
    // Project navigation uses one controller for Vue-owned overlay markup.
    const element = document.getElementById('jlz-fs-overlay')
    if (!(element instanceof HTMLDivElement) || !element.isConnected) {
      throw new Error('Fullscreen overlay was not mounted by AppShell.')
    }
    const overlay = new FullscreenOverlay(element)
    try {
      // The home carousel exists even on a content deep link. Wire it once
      // regardless of the active route, and release the callback with this UI
      // owner so a later Experience can adopt the same scene object safely.
      const carousel = this.host.carousel
      if (carousel) {
        carousel.setCamera(this.host.camera.instance)
        this._unwireCarousel = carousel.onCardClick((idx) => {
          this.onProjectSelect(idx)
        })
      }
      this.overlay = overlay
    } catch (error) {
      this._unwireCarousel?.()
      this._unwireCarousel = null
      overlay.dispose()
      throw error
    }
  }

  /** Frame access to the BakuCarousel (index 3 in the 6-section layout; the
   *  carousel is a child of the Works group, home-only). Experience polls it
   *  inside the frame decision because it may have started morphing this
   *  frame. */
  private getCarousel(): import('./World/BakuCarousel').BakuCarousel | null {
    // The carousel exists in the persistent scene, but only participates in
    // project navigation on home.
    if (this.host.page() !== 'home') return null
    return this.host.carousel
  }

  /** Select the adjacent project from the one canonical active index. */
  public navigateProject(direction: -1 | 1): void {
    if (!this.overlay) return
    const carousel = this.getCarousel()
    if (direction < 0) carousel?.prev()
    else carousel?.next()
    this.onProjectSelect(this.activeProjectIndex + direction)
    // Project navigation changes the carousel target while the demand-driven
    // renderer may already be settled. Wake it explicitly so the target is
    // advanced and the overlay/scene stay visually synchronized.
    this.host.raise('nav')
  }

  onProjectSelect(idx: number, preload: boolean = false): void {
    const overlay = this.overlay
    if (!overlay || PROJECTS.length === 0) return
    const projs = PROJECTS
    const safeIdx = ((idx % projs.length) + projs.length) % projs.length
    this.activeProjectIndex = safeIdx
    const project = projs[safeIdx]
    if (!project) return

    // Open/preload fullscreen overlay with project info + poster.
    // All opens (showreel, slider, /works) use the unified DOM cinematic
    // reveal — no origin='plane' 3D handoff.
    const opts = {
      poster: project.textureUrl,
      title: project.title,
      category: `${project.year ?? ''} · ${project.category ?? ''}`,
      description: project.description,
      tags: project.tags,
      counter: `${safeIdx + 1} / ${projs.length}`,
      hasPrev: true,
      hasNext: true,
    }
    if (preload) {
      overlay.preload(opts)
    } else {
      overlay.open(opts)
    }
  }

  /** Remove every UI-feature listener + dispose the created features. */
  destroy(): void {
    if (this._destroyed) return
    this._destroyed = true
    for (const unsub of this._unsubs) unsub()
    this._unsubs.length = 0
    if (this._worksPlaneTapHandler) {
      window.removeEventListener('pointerup', this._worksPlaneTapHandler)
      this._worksPlaneTapHandler = null
    }
    this._unwireCarousel?.()
    this._unwireCarousel = null
    this._overlayHostUnsub?.()
    this._overlayHostUnsub = null
    this.overlay?.dispose()
    this.overlay = null
    this.storyNav?.dispose()
    this.storyNav = null
  }
}
