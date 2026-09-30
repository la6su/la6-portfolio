// src/Experience/ExperienceUI.ts — Phase 7 slice 4: the former UI features.
//
// `Experience` split: bootstrap (init + readiness), scene coordination
// (per-frame world/camera/post) and the FORMER UI FEATURES — the cinematic
// navigation shell, the menu, the fullscreen overlay, project controls
// and the UI-facing window event handlers. This class owns those features
// (creation, wiring, disposal) and reaches the scene through the narrow
// `ExperienceUIHost` port: no DOM scene knowledge, no renderer access.
//
// Disposal contract: `destroy()` removes every window listener this class
// added and disposes the features it created — Experience.destroy() runs it
// so the root teardown returns every owned resource to baseline.

import { CinematicNav } from '../UI/CinematicNav'
import { UIMenu } from '../UI/UIMenu'
import { FullscreenOverlay } from '../UI/FullscreenOverlay'
import type { UIManager } from '../UI/UIManager'
import type { SceneCoordinator } from './SceneCoordinator'
import type { StageRegistry } from './StageRegistry'
import type { PageId } from '../core/routeManifest'
import { getSoundMuted } from '../core/SfxSystem'
import type { SfxSystem } from '../core/SfxSystem'
import { WORKS_SLOT_INDEX, WORLD_SLOT_COUNT } from '../core/worldSlots'
import { eventBus } from '../core/EventBus'
import { isCurrentRouteContinuation } from '../core/routeContinuation'
import type { Camera } from './Camera'
import type { FrameReason } from '../core/RenderScheduler'
import { PROJECTS } from '../Data/Projects'

/**
 * The narrow port ExperienceUI reaches the scene through. Every accessor is
 * a getter (not a stored reference) so the scene + its owners can only be
 * read AFTER Experience.init() has built them.
 */
export interface ExperienceUIHost {
  page: () => PageId
  coordinator: () => SceneCoordinator
  camera: () => Camera
  ui: () => UIManager
  sfx: () => SfxSystem
  /** Raise render demand + wake the single loop driver (typed reason). */
  raise: (reason?: FrameReason) => void
  reducedMotion: () => boolean
  /** Phase 8 slice 6: the Experience-owned BakuCarousel init (idempotent). */
  ensureCarouselInitialized: () => Promise<void>
  /** The one owner of route stages, read only after Experience initializes. */
  stages: () => StageRegistry
}

export class ExperienceUI {
  /** Vertical native story track plus top/bottom sheets. */
  storyNav: CinematicNav | null = null
  /** The compact console menu. */
  uiMenu: UIMenu | null = null
  /** True after the static project data and overlay are ready to use. */
  private projectUiReady = false
  /** The fullscreen overlay (UIManager may own one; adopt or create). */
  overlay: FullscreenOverlay | null = null
  private ownsOverlay = false
  private activeProjectIndex = 0
  private _projectControlsPromise: Promise<void> | null = null
  private _projectControlsReadyRaf: number | null = null
  private _projectControlsReadyResolve: (() => void) | null = null
  private _unwireCarousel: (() => void) | null = null

  private readonly _unsubs: Array<() => void> = []
  private _worksPlaneTapHandler: ((e: PointerEvent) => void) | null = null
  private _routeGeneration = 0

  /** Route-continuation guard over this host's live generation + page — the
   *  shared idiom behind every async continuation in this file. */
  private _routeContinuationIsCurrent(capturedGeneration: number, capturedPage: PageId): boolean {
    return isCurrentRouteContinuation(
      capturedGeneration,
      this._routeGeneration,
      capturedPage,
      this.host.page(),
    )
  }
  private _destroyed = false

  constructor(private host: ExperienceUIHost) {}

  /** Create + wire the UI features. Called from Experience.init(). */
  init(): void {
    // CinematicNav — vertical native story track plus top/bottom sheets.
    // The section count is the worldSlots contract (single source of the
    // six-slot model), not a literal.
    this.storyNav = new CinematicNav(WORLD_SLOT_COUNT, this.host.page)
    // Phase 7: native scroll is a typed loop wake source.
    this.storyNav.onActivity = () => {
      this.host.raise('nav')
    }
    this.storyNav.onSectionChange((idx) => {
      this.uiMenu?.setActive(idx)
      // Initial hashes are replayed only after the ready splash event. Keep
      // the Works owner explicit at that boundary so a hash-driven arrival
      // cannot depend on an earlier render frame to wake its carousel.
      if (idx === WORKS_SLOT_INDEX && this.host.page() === 'home') {
        const routeGeneration = this._routeGeneration
        const page = this.host.page()
        void this.host.ensureCarouselInitialized().then(() => {
          if (!this._routeContinuationIsCurrent(routeGeneration, page)) return
          if (this.storyNav?.getSectionIndex() === WORKS_SLOT_INDEX) this.host.raise('nav')
        })
      }
      this.host.raise('nav')
    })
    this.storyNav.onActiveChange((active) => {
      if (active) this.host.raise('nav')
    })

    // UIMenu
    this.uiMenu = new UIMenu()
    this.uiMenu.onNavigate((idx) => {
      this.storyNav?.goToSection(idx)
    })

    // The compact storyline lives inside the console bar (bottom strip).
    // If the console bar exists, append there; otherwise fall back to body.
    const consoleBar = document.querySelector('.jlz-console-bar')
    if (consoleBar) {
      consoleBar.appendChild(this.storyNav.el)
    } else {
      document.body.appendChild(this.storyNav.el)
    }

    // Sound config from splash page (localStorage 'jlz:sound' = 'on'|'off').
    // D-7 fix: default to MUTED (matches UIMenu's readSoundMuted default:
    // `localStorage.getItem('jlz:sound') !== 'on'` → true/muted when no key).
    this.host.sfx().setMuted(getSoundMuted())

    // Runtime sound toggle (from UIMenu or other in-app controls)
    this._unsubs.push(
      eventBus.on('jlz:sound-toggle', ({ muted }) => {
        this.host.sfx().setMuted(muted)
      }),
    )

    // ── Semantic project control → open fullscreen overlay ──
    // Works and case-study Vue views emit this port from their native controls.
    // All opens (showreel, slider, /works) use the same unified DOM cinematic
    // reveal — no 3D plane-to-fullscreen handoff, which caused a double effect.
    this._unsubs.push(
      eventBus.on('jlz:open-project', ({ idx }) => {
        if (typeof idx !== 'number') return
        const routeGeneration = this._routeGeneration
        const page = this.host.page()
        void this.ensureProjectControls().then(() => {
          if (!this._routeContinuationIsCurrent(routeGeneration, page)) return
          this.onProjectSelect(idx)
        })
      }),
    )

    this._unsubs.push(
      eventBus.on('jlz:project-navigate', ({ direction }) => {
        if (!this.overlay?.isOpen) return
        this.navigateProject(direction)
      }),
    )

    // ── Close overlay on route change ──
    // When SPA navigates (Menu subnav click, browser back, etc.),
    // close any open FullscreenOverlay. isOpen checks UIKit's native uk-open
    // class — no custom flag to get out of sync.
    this._unsubs.push(
      eventBus.on('jlz:route-change', () => {
        const routeGeneration = ++this._routeGeneration
        if (this.overlay?.isOpen) {
          this.overlay.close()
        }
        const newPage = this.host.page()
        const continuationIsCurrent = () =>
          this._routeContinuationIsCurrent(routeGeneration, newPage)
        const coordinator = this.host.coordinator()
        void (async () => {
          // Rebuild page-specific fog/post/section ranges before route owners
          // reconcile visibility; otherwise SPA navigation keeps boot config.
          await coordinator.refreshRouteConfig()
          if (!continuationIsCurrent()) return
          coordinator.syncRouteVisuals()
          const stages = this.host.stages()
          if (newPage === 'home') {
            void this.host.ensureCarouselInitialized()
          }
          if (newPage === 'works') {
            void stages.ensureWorksPlaneStageInitialized().then(() => {
              if (!continuationIsCurrent()) return
              this.host.coordinator().setWorksPlaneStageSection(0)
              this.host.raise('nav')
            })
          } else {
            // Works owns eight decoded 1440×810 textures. Keeping an inactive
            // stage alive makes that GPU allocation look like a navigation leak.
            stages.disposeWorksPlaneStage()
          }
          if (newPage === 'contact') {
            stages.setContactCyprusStageSection(0)
            coordinator.setContactSceneSection(0)
            void Promise.all([
              stages.ensureContactTypographyStageInitialized(),
              stages.ensureContactCyprusStageInitialized(),
              stages.ensureContactHaloStageInitialized(),
            ]).then(() => {
              if (!continuationIsCurrent()) return
              this.host.raise('nav')
            })
          } else {
            stages.disposeContactTypographyStage()
            stages.disposeContactCyprusStage()
            stages.disposeContactHaloStage()
            coordinator.setContactSceneSection(0)
          }
          if (newPage === 'manifesto') {
            void stages.ensureManifestoInkStageInitialized().then(() => {
              if (!continuationIsCurrent()) return
              this.host.raise('nav')
            })
          } else {
            stages.disposeManifestoInkStage()
          }
          // Phase 8 slice 9: the Lab object's lazy creation moved to Experience
          // (created once on the first /lab visit; never disposed per route leave —
          // the coordinator's `syncRouteVisuals` already hides it off-route).
          if (newPage === 'lab') void stages.ensureLabGamepad()
          this.host.raise('nav')
        })().catch((error: unknown) => {
          // Route work is fire-and-forget by design, but it still needs a
          // terminal rejection boundary. Ignore failures from retired routes;
          // report only errors that belong to the live route continuation.
          if (!continuationIsCurrent()) return
          console.error('[ExperienceUI] route reconciliation failed:', error)
        })
      }),
    )

    // Phase 5: Wobble pulse on card click (work cards + carousel)
    this._unsubs.push(
      eventBus.on('jlz:wobble-pulse', () => {
        this.host.coordinator().baku?.triggerWobblePulse()
        // Keep rendering while the pulse animates (sin-envelope in SplashCube.update).
        this.host.raise('dirty')
      }),
    )

    // Route-owned 3D layers follow the shared content-page navigation contract.
    this._unsubs.push(
      eventBus.on('jlz:page-section-change', ({ index }) => {
        const domIndex = index ?? 0
        const stageIndex = Math.max(0, domIndex - 1)
        const page = this.host.page()
        const coordinator = this.host.coordinator()
        if (page === 'works') {
          // DOM sections: 0=Lab overlay, 1-4=project pairs, 5=Nav overlay.
          coordinator.setWorksPlaneStageSection(stageIndex)
        } else if (page === 'contact') {
          this.host.stages().setContactCyprusStageSection(stageIndex)
          coordinator.setContactSceneSection(stageIndex)
        } else {
          return
        }
        this.host.raise('nav')
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
      const routeGeneration = this._routeGeneration
      const page = this.host.page()
      void this.ensureProjectControls().then(() => {
        if (!this._routeContinuationIsCurrent(routeGeneration, page)) return
        const stage = this.host.coordinator().worksPlaneStage
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
      })
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
    const coordinator = this.host.coordinator()
    coordinator.baku?.triggerOpener()
    if (this.host.reducedMotion()) return
    coordinator.particleBurst?.trigger(0, 0, 0)
    if (coordinator.particleBurst?.isActive) this.host.raise('dirty')
  }

  ensureProjectControls(): Promise<void> {
    if (this.projectUiReady || this._destroyed) return Promise.resolve()
    if (this._projectControlsPromise) return this._projectControlsPromise
    const initialization = this.initializeProjectControls().catch((error: unknown) => {
      this.projectUiReady = false
      if (this.ownsOverlay) this.overlay?.dispose()
      this.overlay = null
      this.ownsOverlay = false
      if (import.meta.env.DEV) {
        console.error('[ExperienceUI] project controls init failed:', error)
      }
    })
    const tracked = initialization.finally(() => {
      if (this._projectControlsPromise === tracked) this._projectControlsPromise = null
    })
    this._projectControlsPromise = tracked
    return tracked
  }

  private async initializeProjectControls(): Promise<void> {
    if (this.projectUiReady || this._destroyed) return
    const generation = this._routeGeneration
    // Always prepare project controls — single-page experience.
    // The scene must be initialised (sections attached to the Tres scene)
    // before the Works raycast can run against the 3D planes.
    const coordinator = this.host.coordinator()
    const ready = () => coordinator.sections.length > 0
    if (!ready()) {
      // Wait one frame for the scene init to finish, then retry.
      await new Promise<void>((resolve) => {
        this._projectControlsReadyResolve = resolve
        this._projectControlsReadyRaf = requestAnimationFrame(() => {
          this._projectControlsReadyRaf = null
          this._projectControlsReadyResolve = null
          resolve()
        })
      })
      if (this._destroyed || generation !== this._routeGeneration) return
      if (!this.projectUiReady && !ready()) return
    }

    // Re-check after the readiness wait — page may have changed while the
    // scene was becoming available. Projects are already part of the static
    // scene graph through the carousel and Works stage, so a dynamic import
    // here cannot create a separate chunk.
    if (this._destroyed || generation !== this._routeGeneration || this.projectUiReady) return

    // FullscreenOverlay is normally created by UIManager. Project navigation
    // is routed through `jlz:project-navigate` so arrows and keyboard use the
    // same owner even if the overlay was created before these controls resolve.
    if (!this.overlay) {
      const shared = this.host.ui().overlay
      this.overlay = shared ?? new FullscreenOverlay()
      this.ownsOverlay = !shared
    }

    // The home carousel exists even on a content deep link. Wire it once
    // regardless of the active route, and release the callback with this UI
    // owner so a later Experience can adopt the same scene object safely.
    const carousel = coordinator.carousel
    if (carousel) {
      carousel.setCamera(this.host.camera().instance)
      this._unwireCarousel = carousel.onCardClick((idx) => {
        this.onProjectSelect(idx)
      })
    }
    this.projectUiReady = true
  }

  /** Frame access to the BakuCarousel (index 3 in the 6-section layout; the
   *  carousel is a child of the Works group, home-only). Experience polls it
   *  inside the frame decision because it may have started morphing this
   *  frame. */
  public getCarousel(): import('./World/BakuCarousel').BakuCarousel | null {
    // The carousel exists in the persistent scene, but only participates in
    // project navigation on home.
    if (this.host.page() !== 'home') return null
    // The reference lives on SceneCoordinator's typed owner boundary.
    return this.host.coordinator()?.carousel ?? null
  }

  /** Select the adjacent project from the one canonical active index. */
  public navigateProject(direction: -1 | 1): void {
    if (!this.projectUiReady) return
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
    if (!this.projectUiReady || !this.overlay || PROJECTS.length === 0) return
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
      this.overlay.preload(opts)
    } else {
      this.overlay.open(opts)
    }
  }

  /** Remove every UI-feature listener + dispose the created features. */
  destroy(): void {
    if (this._destroyed) return
    this._destroyed = true
    this._routeGeneration++
    if (this._projectControlsReadyRaf !== null) {
      cancelAnimationFrame(this._projectControlsReadyRaf)
      this._projectControlsReadyRaf = null
    }
    this._projectControlsReadyResolve?.()
    this._projectControlsReadyResolve = null
    for (const unsub of this._unsubs) unsub()
    this._unsubs.length = 0
    if (this._worksPlaneTapHandler) {
      window.removeEventListener('pointerup', this._worksPlaneTapHandler)
      this._worksPlaneTapHandler = null
    }
    this.projectUiReady = false
    this._unwireCarousel?.()
    this._unwireCarousel = null
    if (this.ownsOverlay) this.overlay?.dispose()
    this.overlay = null
    this.ownsOverlay = false
    this.uiMenu?.dispose()
    this.uiMenu = null
    this.storyNav?.dispose()
    this.storyNav = null
  }
}
