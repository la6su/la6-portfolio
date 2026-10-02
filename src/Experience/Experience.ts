import * as THREE from 'three'
import { watch, type WatchStopHandle } from 'vue'
import { Camera } from './Camera'
import { Renderer } from './Renderer'
import type { DevPanel } from '../core/DevPanel'
import { ContentReveal } from './ContentReveal'
import { Cursor } from './Cursor'
import { input } from './Input'
import { SfxSystem } from '../core/SfxSystem'

import { ExperienceUI } from './ExperienceUI'
import { SceneCoordinator } from './SceneCoordinator'
import { observeReducedMotion, prefersReducedMotion } from '../core/motionPolicy'
import { DeviceCapability } from '../core/DeviceCapability'
import { FrameTiming } from '../core/FrameTiming'
import { FpsTracker } from './FpsTracker'
import { SceneEnvironment } from './SceneEnvironment'
import { ShowreelController } from './ShowreelController'
import { WORKS_SLOT_INDEX } from '../core/worldSlots'
import { DEFAULT_CAMERA_SMOOTHING } from '../core/WorldConfig'
import {
  NO_ACTIVITY,
  anyActivity,
  idleForAmbientBreath,
  type RenderActivity,
} from '../core/renderDemand'
import { RenderScheduler, type FrameReason } from '../core/RenderScheduler'
import { createReadinessGate, type ReadinessGate } from '../core/readinessGate'
import type { SceneHostReady } from './SceneHostContract'
import { eventBus } from '../core/EventBus'
import { isCurrentRouteContinuation } from '../core/routeContinuation'
import { CinematicLights } from './World/Lights'
import { GroundPlane } from './Scene/GroundPlane'
import { SectionGroups } from './Scene/SectionGroups'
import { StageRegistry } from './StageRegistry'
import type { EnvSphere } from './World/EnvSphere'
import { SplashCube } from './World/SplashCube'
import { ParticleBurst } from './World/ParticleBurst'
import { DrawTrail } from './World/DrawTrail'
import type { BakuCarousel } from './World/BakuCarousel'
import type { ServicesStage } from './World/ServicesStage'
import { disposeAllCaseTextures } from './World/caseTexture'
import { devDiagnostic } from '../core/devDiagnostic'
import { traceDevLifecycle } from '../core/devLifecycleTrace'

/**
 * Instances and scene roots borrowed from the persistent SceneHost. Experience
 * adopts them without constructing a parallel scene or camera. `replaceRenderer`
 * keeps Tres aligned after device-loss recovery.
 *
 * Derived from the Vue host event so host capabilities stay declared once:
 * Experience drops backend facts it never reads; SceneHostReady exposes the
 * individual reactive size values that Experience needs.
 */
type ExperienceHost = Omit<SceneHostReady, 'backend'>

export class Experience {
  scene!: THREE.Scene
  /** Per-frame delta clamp — internal to the loop host. */
  camera!: Camera
  renderer!: Renderer
  private contentReveal!: ContentReveal
  private cursor!: Cursor
  private _themeAppliedUnsub: (() => void) | null = null
  private _splashEnteredUnsub: (() => void) | null = null
  private devPanel: DevPanel | null = null
  private _frameTiming: FrameTiming | null = null
  // Coordinates section state, transforms and updates over adopted scene
  // owners. Experience constructs and disposes this coordinator.
  public coordinator!: SceneCoordinator
  // Experience owns these controllers; their scene nodes are declared in Vue.
  private lights!: CinematicLights
  private ground!: GroundPlane
  // Adopts the six stable section roots declared by SceneHost.
  private sectionGroups!: SectionGroups
  // Vue owns the ambient pavilion nodes; the coordinator forwards updates.
  private envSphere!: EnvSphere
  // Behavior controller around the Vue-declared boot cube.
  private baku!: SplashCube
  // Behavior controllers around Vue-declared intro frames and cursor trail.
  private particleBurst!: ParticleBurst
  private drawTrail!: DrawTrail
  // Carousel declared under the Works root; SectionGroups owns its disposal
  // ordering and Experience owns initialization and per-frame coordination.
  private carousel: BakuCarousel | null = null
  private _carouselInitPromise: Promise<void> | null = null
  // StageRegistry owns the six route stages and their lifecycle.
  private readonly _stages!: StageRegistry
  private servicesStage: ServicesStage | null = null
  // Showreel render mode (ShowreelController.ts): the lazy GPU-side theater,
  // its typed bus commands, the reduced-motion forwarding and the render swap.
  private _showreel!: ShowreelController
  // Owns navigation, menu, overlay, project controls, and UI event wiring.
  private features: ExperienceUI | null = null
  private readonly _host: ExperienceHost
  private _destroyed = false
  private _destroyPromise: Promise<void> | null = null
  private _lifecycleGeneration = 0
  /** Active GPU prewarm; teardown keeps its renderer and scene alive until it settles. */
  private _scenePrewarmPromise: Promise<void> | null = null

  private currentSectionContext: string | null = null
  private _prevSectionIndex = -1
  private _stopSizeWatch: WatchStopHandle | null = null
  private _rendererRecoveredUnsub: (() => void) | null = null
  private _routeChangeUnsub: (() => void) | null = null
  private _pageSectionChangeUnsub: (() => void) | null = null
  private _routeGeneration = 0
  public sfx: SfxSystem = new SfxSystem()
  /** Cinematic story track owned by ExperienceUI. */
  private get _storyNav() {
    return this.features?.storyNav ?? null
  }
  private _needsRender = true // start true to render the first frame
  private _debugContinuousRendering = false
  // Ambient breathing requests one refresh frame every ~2.5 s while idle.
  // The loop stops when settled, so the per-frame dt
  // accumulator can no longer advance; the breath is a wall-clock timer that
  // raises demand + fires a typed 'breath' invalidation on the scheduler.
  private _breathTimer: ReturnType<typeof setTimeout> | null = null
  private static readonly AMBIENT_BREATH_INTERVAL = 2.5 // seconds between idle refresh frames
  private _reducedMotion = false // synchronized with prefers-reduced-motion (updated in init)
  private _reducedMotionUnsub: (() => void) | null = null
  // Single demand-loop policy installed into Tres through SceneHost. The
  // scheduler starts on invalidation, stops after a settled frame, and owns
  // hidden-tab pause/resume.
  private _scheduler!: RenderScheduler
  /** Converts Tres/Cientos invalidate calls into scheduler demand. */
  private _unsubExternalInvalidate: (() => void) | null = null
  /** Terminal render-failure gate (device-loss budget exhausted). */
  private _webglFailedUnsub: (() => void) | null = null
  private _renderDisabled = false
  /** Reused per-frame activity snapshot; predicates consume it synchronously.
   *  The settle decision reads it after the frame, so a same-frame raise
   *  (section change, breath fire, …) is honored. */
  private _activitySnapshot: RenderActivity = { ...NO_ACTIVITY }
  // Render-budget FPS tracker (rolling window + low-FPS verdict, FpsTracker.ts).
  // Read by DevPanel (low fps ⚠ indicator); the auto-reduce policy below is
  // Experience's because it owns the scene groups.
  private readonly _fpsTracker = new FpsTracker()
  /** True when FPS < 30 sustained over 60 frames. Read by DevPanel. */
  public get lowFps(): boolean {
    return this._fpsTracker.lowFps
  }
  public get needsRender(): boolean {
    return this._needsRender || this._debugContinuousRendering
  }
  /** Developer-only loop override used by DevPanel. */
  public setDebugContinuousRendering(enabled: boolean): void {
    if (!import.meta.env.DEV || this._destroyed || enabled === this._debugContinuousRendering)
      return
    this._debugContinuousRendering = enabled
    if (enabled) this._raiseRenderDemand('external')
  }
  // Procedural IBL environment owner (SceneEnvironment.ts): applied once
  // after renderer.init() and re-applied after a device-loss recovery.
  private _environment!: SceneEnvironment

  // Owns the first-draw readiness promise, timeout, and teardown cancellation.
  private _readinessGate: ReadinessGate | null = null
  // Auto-reduce: when _lowFps flips true, halve all JunniParticles counts.
  // One-way: restoring particle counts can cause a GPU spike and re-trigger
  // the low-FPS condition.
  private _particleReductionApplied = false
  constructor(host: ExperienceHost) {
    // SceneHost is the single scene + camera owner. Experience adopts those
    // instances for cinematic state and never creates a fallback world.
    this._host = host
    this.scene = host.scene
    this.camera = new Camera(
      host.camera,
      DeviceCapability.getInstance().isMobile,
      () => this._host.page() === 'home',
      host.isLabCameraActive,
    )
    this.renderer = new Renderer(() => ({
      width: host.sizes.width.value,
      height: host.sizes.height.value,
      dpr: host.sizes.pixelRatio.value,
    }))
    // The env owner reads the renderer + glass cube lazily: it is applied
    // after renderer.init() and again after a device-loss recovery.
    this._environment = new SceneEnvironment({
      scene: this.scene,
      renderer: () => this.renderer,
      baku: () => this.baku,
    })
    this._showreel = new ShowreelController({
      isDestroyed: () => this._destroyed,
      reducedMotion: () => this._reducedMotion,
      mountTheater: (theater) => this._host.stages.showreelTheater.mount(theater),
      unmountTheater: (theater) => this._host.stages.showreelTheater.unmount(theater),
    })
    // Keep route, polarity and motion reads live: lazy stages can be created
    // long after the initial scene has mounted.
    this._stages = new StageRegistry({
      currentPage: this._host.page,
      camera: this._host.camera,
      viewport: () => ({
        width: host.sizes.width.value,
        height: host.sizes.height.value,
      }),
      host: this._host.stages,
      isContactLight: () => this.contentReveal?.isLight ?? false,
      reducedMotion: () => this._reducedMotion,
      syncRouteVisuals: () => this.coordinator.syncRouteVisuals(),
    })

    // Install one demand scheduler into the persistent Tres loop. A callback
    // opens the loop window; null closes it. Visibility pauses the loop and
    // resumes it with one invalidation.
    this._scheduler = new RenderScheduler(
      {
        setLoop: (cb) => {
          this._host.loop.onFrame(cb)
          if (cb) this._host.loop.start()
          else this._host.loop.stop()
        },
      },
      {
        onFrame: (deltaMs) => {
          if (this.coordinator) this.update(deltaMs)
        },
        isSettled: () => !this.coordinator || this._isLoopSettled(),
      },
    )
    // Tres/Cientos invalidate calls (for example Lab camera-control changes)
    // enter the same demand path as internal activity.
    this._unsubExternalInvalidate = this._host.loop.onExternalInvalidate(() =>
      this._raiseRenderDemand('external'),
    )
    // A terminal device-loss failure stops the loop through the event bus.
    this._webglFailedUnsub = eventBus.on('jlz:webgl-failed', () => {
      this._renderDisabled = true
      this._scheduler.settleNow()
    })

    // Tres owns viewport observation, renderer sizing/DPR and camera aspect.
    // Project stages still need the same reactive dimensions for their own
    // viewport-dependent transforms.
    this._stopSizeWatch = watch([host.sizes.width, host.sizes.height], ([width, height]) => {
      this.resizeSceneOwners(width, height)
      this._raiseRenderDemand('resize')
    })
  }

  private resizeSceneOwners(width: number, height: number): void {
    // Tres already sizes the renderer and updates registered camera aspect.
    // Fan its current dimensions only to project-owned transforms.
    this.coordinator?.resize(width, height)
    // Route stages are lazy and may not exist until their route is reached.
    this._stages.worksPlaneStage?.resize(width, height)
    // Cyprus owns a viewport-dependent map scale and follows orientation and
    // address-bar viewport changes too.
    this._stages.contactCyprusStage?.resize(width, height)
  }

  private lifecycleToken(): number {
    return this._lifecycleGeneration
  }

  private isLifecycleCurrent(token: number): boolean {
    return !this._destroyed && token === this._lifecycleGeneration
  }

  private installRendererRecovery(): void {
    if (this._rendererRecoveredUnsub) return
    this._rendererRecoveredUnsub = eventBus.on('jlz:renderer-recovered', () => {
      if (this._destroyed) return
      this._environment.apply()
      if (this._destroyed) return
      this._raiseRenderDemand('recovery')
    })
  }

  /** Reconcile route-owned scene state at the semantic route boundary. */
  private installSceneEventHandlers(): void {
    if (this._routeChangeUnsub || this._pageSectionChangeUnsub) return
    this._routeChangeUnsub = eventBus.on('jlz:route-change', () => {
      const routeGeneration = ++this._routeGeneration
      const page = this._host.page()
      const isCurrent = () =>
        isCurrentRouteContinuation(routeGeneration, this._routeGeneration, page, this._host.page())
      try {
        // Rebuild page-specific fog/post/section ranges before route owners
        // reconcile visibility; otherwise SPA navigation keeps boot config.
        this.coordinator.init()
        const routeStagesReady = this._stages.reconcileRoute(page)
        this.coordinator.setContactSceneSection(0)
        if (page === 'home') {
          void this.ensureCarouselInitialized().then(() => {
            if (isCurrent()) this._raiseRenderDemand('nav')
          })
        }
        if (page === 'works') {
          void routeStagesReady.then(() => {
            if (!isCurrent()) return
            this.coordinator.setWorksPlaneStageSection(0)
            this._raiseRenderDemand('nav')
          })
        }
        if (page === 'contact') {
          this._stages.setContactCyprusStageSection(0)
          void routeStagesReady.then(() => {
            if (isCurrent()) this._raiseRenderDemand('nav')
          })
        }
        if (page === 'manifesto') {
          void routeStagesReady.then(() => {
            if (isCurrent()) this._raiseRenderDemand('nav')
          })
        }
        this._raiseRenderDemand('nav')
      } catch (error: unknown) {
        if (!isCurrent()) return
        console.error('[Experience] route reconciliation failed:', error)
      }
    })
    this._pageSectionChangeUnsub = eventBus.on('jlz:page-section-change', ({ index }) => {
      const stageIndex = Math.max(0, index - 1)
      const page = this._host.page()
      if (page === 'works') {
        this.coordinator.setWorksPlaneStageSection(stageIndex)
      } else if (page === 'contact') {
        this._stages.setContactCyprusStageSection(stageIndex)
        this.coordinator.setContactSceneSection(stageIndex)
      } else {
        return
      }
      this._raiseRenderDemand('nav')
    })
  }

  private _handleReducedMotionChange(reduced: boolean): void {
    if (reduced === this._reducedMotion || this._destroyed) return
    this._reducedMotion = reduced
    this.renderer?.postManager?.setReducedMotion(reduced)
    this.coordinator?.setReducedMotion(reduced)
    this.lights?.setReducedMotion(reduced)
    this.camera?.setReducedMotion(reduced)
    this._showreel.setReducedMotion(reduced)
    this._storyNav?.setReducedMotion(reduced)
    if (reduced) {
      this._cancelBreath()
    }
    // Owners snap synchronously on reduce, but the new state still needs one
    // draw before the demand scheduler can settle the loop.
    this._raiseRenderDemand('motion-preference')
  }

  private async buildScene(token: number): Promise<void> {
    if (!this.isLifecycleCurrent(token)) return
    // Adopt the six section roots mounted by Vue/Tres before Experience
    // initialization. This controller does not create or attach scene nodes.
    this.sectionGroups = new SectionGroups(
      this.scene,
      this._host.page,
      () => this._storyNav?.getSide() ?? 'center',
      this._host.sectionRoots,
    )
    const servicesStage = this._host.servicesStage
    this.servicesStage = servicesStage
    this.carousel = this.sectionGroups.works.carousel
    if (this.carousel) {
      await this._host.stages.carousel.mount(this.carousel)
      if (!this.isLifecycleCurrent(token)) return
    }
    await this._host.stages.particles.mount(this.sectionGroups.works.particles)
    if (!this.isLifecycleCurrent(token)) return
    // These owners and the scene roots are stable for the Experience lifetime.
    // Construct them before the coordinator so its frame path can hold direct
    // references; only lazily replaced route stages need registry lookups.
    this.envSphere = this._host.envSphere
    this.baku = new SplashCube(this._host.baku)
    this.particleBurst = new ParticleBurst(this._host.introFrames)
    this.drawTrail = new DrawTrail(this._host.cursorTrail)
    this.lights = new CinematicLights(this._host.lights)
    this.ground = new GroundPlane(this._host.ground)
    if (this.carousel) this.carousel.onActivity = () => this._raiseRenderDemand('dirty')
    this.coordinator = new SceneCoordinator(
      this.scene,
      this.camera.instance,
      {
        ground: this.ground,
        sectionGroups: this.sectionGroups,
        envSphere: this.envSphere,
        baku: this.baku,
        particleBurst: this.particleBurst,
        drawTrail: this.drawTrail,
        carousel: this.carousel,
        stages: this._stages,
        servicesStage: this.servicesStage,
      },
      this._host.page,
      () => this._reducedMotion,
    )
    this.coordinator.init()
    // Scene owners may have been constructed while the preference changed
    // during async startup. Apply Experience's current policy as one fan-out.
    this.coordinator.setReducedMotion(this._reducedMotion)
    // The home carousel finishes texture
    // decode before Enter becomes ready (otherwise its first section visit
    // performs image work inside navigation); content deep-links defer setup
    // — ExperienceUI calls the idempotent method on every route change.
    if (this._host.page() === 'home') await this.ensureCarouselInitialized()
    if (!this.isLifecycleCurrent(token)) return
    void this._stages.reconcileRoute(this._host.page())
    if (!this.isLifecycleCurrent(token)) return
    // The coordinator initializes section behavior; route-owned stages enter
    // the scene through their declarative host ports.
    const prewarm = this.coordinator.prewarmHomeMedia(this.renderer.instance, this.camera.instance)
    this._scenePrewarmPromise = prewarm
    try {
      await prewarm
    } finally {
      if (this._scenePrewarmPromise === prewarm) this._scenePrewarmPromise = null
    }
    if (!this.isLifecycleCurrent(token)) return
    // Apply the initial section's light and ground state before the first
    // rendered frame.
    const firstCfg = this.coordinator.sections[1]?.phaseConfig
    if (firstCfg) {
      this.lights.changeSection(firstCfg)
      this.ground.applyInitialConfig(firstCfg.ground)
      // Start on the intro palette; the initial theme event resolves polarity.
      this.envSphere.changeSection(1, false)
    }
  }

  /** Initialize the persistent home carousel once, including after a deep link.
   *  SectionGroups owns its scene object and disposal; Experience owns init. */
  public ensureCarouselInitialized(): Promise<void> {
    if (this._carouselInitPromise) return this._carouselInitPromise
    const carousel = this.carousel
    if (!carousel) return Promise.resolve()

    const initPromise = carousel.init().then(
      () => {
        devDiagnostic('info', '[Experience] BakuCarousel initialized (works section)')
      },
      (err) => {
        if (this._carouselInitPromise === initPromise) this._carouselInitPromise = null
        if (import.meta.env.DEV) {
          console.error(
            '[Experience] BakuCarousel init FAILED — textures may not load, event listeners NOT attached:',
            err,
          )
        }
      },
    )
    this._carouselInitPromise = initPromise
    return this._carouselInitPromise
  }

  async init() {
    if (this._destroyed) {
      throw new DOMException('Experience initialization was cancelled.', 'AbortError')
    }
    const token = this.lifecycleToken()
    // Install recovery ownership before the first renderer/scene await. A
    // device-loss event can arrive during any async initialization gap.
    this.installRendererRecovery()
    // `input` is a module singleton shared by Camera and DrawTrail. Reattach
    // its listener when a new Experience follows an explicit teardown/HMR.
    input.start()
    // NOTE: SmoothScroll/Lenis remains unnecessary: CinematicNav uses the
    // browser's vertical scrolling and snap behavior. FullscreenOverlay locks
    // body overflow directly while the fullscreen overlay is open.
    this._reducedMotion = prefersReducedMotion()
    this._reducedMotionUnsub?.()
    this._reducedMotionUnsub = observeReducedMotion((reduced) =>
      this._handleReducedMotionChange(reduced),
    )
    this.contentReveal = new ContentReveal(this._host.page)
    this.cursor = new Cursor(this.sfx)
    // Input was attached above, so pointer coordinates update before Cursor
    // wakes the shared loop; the Works trail consumes them in that same frame.
    this.cursor.onActivity = () => this._raiseRenderDemand('cursor')
    // Showreel theater commands — Vue chrome (ShowreelConsole.vue) emits over the
    // typed bus; the controller owns the lazy GPU-side stage and the render swap.
    this._showreel.bind()
    await this.renderer.init({
      instance: this._host.renderer,
      mode: this._host.mode,
      onInstanceReplaced: (instance, mode) => this._host.replaceRenderer(instance, mode),
    })
    if (!this.isLifecycleCurrent(token)) {
      throw new DOMException('Experience initialization was cancelled.', 'AbortError')
    }
    await this.buildScene(token)
    if (!this.isLifecycleCurrent(token)) {
      throw new DOMException('Experience initialization was cancelled.', 'AbortError')
    }
    const features = new ExperienceUI({
      page: this._host.page,
      baku: this.baku,
      particleBurst: this.particleBurst,
      carousel: this.carousel,
      camera: this.camera,
      sfx: this.sfx,
      raise: (reason) => this._raiseRenderDemand(reason),
      reducedMotion: () => this._reducedMotion,
      stages: this._stages,
    })
    this.features = features
    // Enter is not exposed until the first successful frame, after the UI
    // owner and its scene dependencies have been initialized.
    this._splashEnteredUnsub = eventBus.on('jlz:splash-entered', () => {
      features.triggerSplashOpener()
    })
    // ── 3D ↔ theme sync: EnvSphere follows per-section theme ──
    // ContentReveal dispatches jlz:theme-applied on every section change with
    // the resolved sectionIndex + isLight. Each section has its own dark/light
    // tone pair, so EnvSphere always shows the active section's colour.
    // Theme toggle (snap=true) → instant snap. Section change (snap=false) → lerp.
    // Theme-specific syncs (ground, baku, particles) only run when the polarity
    // actually changed, not on every same-polarity scroll step.
    this._themeAppliedUnsub = eventBus.on('jlz:theme-applied', (detail) => {
      // The cursor is a DOM/canvas owner outside the scene graph. Its cached
      // palette follows the same typed theme-only boundary and requests one
      // redraw even when its motion state is already settled.
      if (detail.themeChanged !== false) this.cursor.refreshThemeCache()
      // The scene input port: the typed ThemeAppliedPort detail that
      // ContentReveal dispatches on every section change / theme toggle.
      const sectionIdx = detail.sectionIndex
      // Keep the ambient environment aligned with the active section theme.
      if (this.envSphere) {
        if (detail.snap) {
          this.envSphere.snapToSection(sectionIdx, detail.isLight)
        } else {
          this.envSphere.changeSection(sectionIdx, detail.isLight)
        }
      }
      // Theme-only syncs — skip when just the section moved (same polarity).
      if (detail.themeChanged !== false) {
        this.coordinator.syncTheme(detail.isLight)
      }
      this._raiseRenderDemand('dirty')
    })

    // ContentReveal can resolve the initial polarity before Experience has
    // registered the listener above. Replay that settled DOM state so the
    // ambient pavilion, glass and contact ground never boot one polarity
    // behind the semantic interface.
    const initialIsLight = this.contentReveal.isLight
    this.envSphere.snapToSection(this.coordinator.currentSectionIndex, initialIsLight)
    this.coordinator.syncTheme(initialIsLight)

    // ── Glassmorphism: studio environment map for realistic glass reflections ──
    // Generated once at init, costs ZERO per frame. The PMREM also benefits
    // the ground plane (subtle reflections). Failure inside the owner
    // preserves the previous environment (see SceneEnvironment.apply).
    this._environment.apply()

    // Initialize navigation, menus, overlays and project controls after the
    // scene and environment are ready.
    this.installSceneEventHandlers()
    features.init()

    // DevPanel — created AFTER nav so it can read current section
    if (import.meta.env.DEV) {
      try {
        this._frameTiming = new FrameTiming()
        const { DevPanel: DevPanelCtor } = await import('../core/DevPanel')
        // HMR or host teardown can land while the dev-only chunk is loading.
        // Do not construct a panel or publish its window probe after destroy.
        if (!this.isLifecycleCurrent(token)) {
          throw new DOMException('Experience initialization was cancelled.', 'AbortError')
        }
        this.devPanel = new DevPanelCtor({
          scene: this.scene,
          renderer: this.renderer,
          ground: this.ground,
          carousel: () => (this._host.page() === 'home' ? this.carousel : null),
          sectionIndex: () => this._storyNav?.getSectionIndex() ?? 0,
          worldSectionIndex: () => this.coordinator.currentSectionIndex,
          navigateProject: (direction) => this.features?.navigateProject(direction),
          needsRender: () => this.needsRender,
          lowFps: () => this.lowFps,
          setDebugContinuousRendering: (enabled) => this.setDebugContinuousRendering(enabled),
        })
        // Dev-only probe exposes resource and loop diagnostics.
        ;(
          window as unknown as {
            __jlzRuntimeSnapshot?: () => {
              resources: unknown
              loop: unknown
              configIds: readonly string[]
              demand: {
                needsRender: boolean
                cursorSettled: boolean | null
                activity: Record<string, boolean>
              }
              timing: ReturnType<FrameTiming['snapshot']>
            } | null
          }
        ).__jlzRuntimeSnapshot = () => {
          if (!this.devPanel) return null
          return {
            resources: this.devPanel.getResourceSnapshot(),
            loop: this._scheduler.diagnostics,
            configIds: this.coordinator.configIds,
            // Expose the demand state that determines whether the loop can
            // settle after its current frame.
            demand: {
              needsRender: this._needsRender,
              cursorSettled: this.cursor?.isSettled ?? null,
              activity: { ...this._activitySnapshot },
            },
            timing: this._frameTiming?.snapshot() ?? null,
          }
        }
        devDiagnostic('info', '[Experience] DevPanel ready — press ` or ~ or Ctrl+D to toggle')
      } catch (e) {
        if (!this.isLifecycleCurrent(token)) {
          throw new DOMException('Experience initialization was cancelled.', 'AbortError')
        }
        console.warn('[Experience] DevPanel init failed:', e)
      }
    }

    // Always prepare project controls — single-page, always needs the Works slider.
    this.features?.ensureProjectControls()
    // The scheduler starts the frame callback on first invalidation and stops
    // after a settled frame. Tres remains the single loop host, while the
    // renderer keeps its normal swap-chain pacing.
    // Readiness requires a successful first draw. A bounded timeout rejects
    // startup instead of enabling Enter over a scene that never rendered.
    this._readinessGate = createReadinessGate(20000)
    this._scheduler.invalidate('first-frame')
    await this._readinessGate.promise
    this._readinessGate = null
  }

  /**
   * Raise render demand from OUTSIDE the frame (event handlers, async
   * callbacks) and wake the single loop driver if the loop has settled.
   * In-frame raises may keep writing `_needsRender` directly — the loop is
   * already running by definition.
   */
  private _raiseRenderDemand(reason: FrameReason = 'dirty'): void {
    if (this._renderDisabled) return
    this._needsRender = true
    this._scheduler.invalidate(reason)
  }

  /**
   * Post-frame settle decision for the single loop driver: the
   * loop may stop after this frame only when demand is clear, nothing is
   * active, and the cursor spring has converged (it needs frames even when the
   * scene is settled). Equivalent to "the next frame would draw nothing".
   */
  private _isLoopSettled(): boolean {
    return (
      this._updateFailed ||
      this._renderDisabled ||
      ((!import.meta.env.DEV || !this._debugContinuousRendering) &&
        !this._needsRender &&
        !anyActivity(this._activitySnapshot) &&
        this.cursor?.isSettled !== false)
    )
  }

  // ── Ambient breath (wall-clock timer) ──
  /**
   * Arm the ~2.5 s breath timer while the scene is idle, or drop it while
   * active / hidden / reduced-motion. Called on every frame with the
   * frame's activity snapshot. The armed timer survives loop stop (that is
   * the point: the loop is stopped when settled) and fires through the
   * scheduler's typed 'breath' invalidation.
   */
  private _scheduleBreath(activity: RenderActivity): void {
    const idle = !document.hidden && idleForAmbientBreath(activity, this._reducedMotion)
    if (!idle || this._breathTimer !== null) {
      if (!idle) this._cancelBreath()
      return
    }
    this._breathTimer = setTimeout(
      () => this._onBreathFire(),
      Experience.AMBIENT_BREATH_INTERVAL * 1000,
    )
  }

  private _cancelBreath(): void {
    if (this._breathTimer !== null) {
      clearTimeout(this._breathTimer)
      this._breathTimer = null
    }
  }

  private _onBreathFire(): void {
    this._breathTimer = null
    // Keep the ambient rhythm going while the scene stays idle.
    this._scheduleBreath(this._activitySnapshot)
    // Activity may have resumed since the last frame — then no breath frame.
    if (document.hidden || !idleForAmbientBreath(this._activitySnapshot, this._reducedMotion))
      return
    this._needsRender = true
    this._scheduler.invalidate('breath')
  }

  update(deltaMs: number) {
    // A later invalidation is allowed to make one diagnostic/recovery attempt
    // after a failed frame; the failed frame itself must not keep the loop
    // alive indefinitely.
    this._updateFailed = false
    try {
      this._updateInner(deltaMs)
    } catch (err) {
      this._needsRender = false
      this._updateFailed = true
      if (!this._updateErrorLogged) {
        this._updateErrorLogged = true
        console.error('[Experience] update() threw:', err)
      }
    }
  }

  private _updateErrorLogged = false
  private _updateFailed = false

  private _updateInner(deltaMs: number) {
    const frameTiming = this._frameTiming
    const frameStart = frameTiming ? performance.now() : 0
    const frameDeltaMs = THREE.MathUtils.clamp(deltaMs, 0, 100)
    const dt = frameDeltaMs / 1000
    this._fpsTracker.observe(frameDeltaMs)
    // Section state deadlines (ready → viewing → passed) advance here —
    // the machine owns the policy, the frame path just advances the clock.
    this.coordinator?.updateSections(dt)
    // Cursor always updates (DOM, cheap — not GPU rendering)
    this.cursor.update()

    // Navigation: read the native vertical story track.
    this._storyNav?.update()

    // The transform pass reads continuous story progress directly; section
    // arrivals still trigger the cube face rotation below.

    // ── On-demand rendering ──
    // Only render when something is actually changing. When idle (settled
    // on a section, no transition, no carousel), the last rendered frame
    // stays on screen and GPU is idle.
    const navActive = this._storyNav?.isActive() ?? false
    // Read the current state before the transform pass. On the threshold
    // crossing frame, active navigation keeps the frame scheduled; later
    // frames use isAnimating to carry the morph through to its settled state.
    const carousel = this._host.page() === 'home' ? this.carousel : null
    const carouselActive = carousel?.isAnimating ?? false
    const worksPlaneActive = this._stages.worksPlaneStage?.isAnimating ?? false
    const contactCyprusActive = this._stages.contactCyprusStage?.isAnimating ?? false
    const contactHaloActive = this._stages.contactHaloStage?.isAnimating ?? false
    const drawTrailActive = this.drawTrail?.isAnimating ?? false
    const baku = this.baku
    const openerActive = baku?.isOpenerActive ?? false
    const burstActive = this.particleBurst?.isActive ?? false
    const camShaking = this.camera.isShaking
    // Cube face rotation animation — keep rendering while the cube is rotating
    // to its target face (triggered by rotateToFace on section change).
    const cubeRotating = this.baku?.isRotating ?? false
    // ── Visible JunniParticles need continuous frames ──
    // Particles only exist on Works. Their animation is GPU-side via uTime; if
    // on-demand freezes the loop, drift only advances on ambient-breath
    // frames (~2.5s) and looks stuck. Keep rendering while a particle field
    // is on a visible group (respects prefers-reduced-motion).
    const particlesActive =
      !this._reducedMotion && (this.coordinator?.hasVisibleParticles() ?? false)
    const ambientSceneActive =
      !this._reducedMotion && (this.coordinator?.hasVisibleAmbientMotion() ?? false)

    // ── Zoom pulse active ──
    const camPulsing = this.camera.isPulsing

    // This snapshot is the single input to the render-demand and idle-breath
    // policies, keeping activity collection separate from policy decisions.
    const activity = this._activitySnapshot
    activity.nav = navActive
    activity.carousel = carouselActive
    activity.worksPlane = worksPlaneActive
    activity.contactCyprus = contactCyprusActive
    activity.contactHalo = contactHaloActive
    activity.drawTrail = drawTrailActive
    activity.opener = openerActive
    activity.burst = burstActive
    activity.camShaking = camShaking
    activity.cubeRotating = cubeRotating
    activity.camPulsing = camPulsing
    activity.particles = particlesActive
    activity.ambientScene = ambientSceneActive
    activity.showreel = this._showreel.isAnimating

    if (anyActivity(activity)) {
      this._needsRender = true
    }

    // ── A4: Ambient breathing ──
    // When fully idle (no particles/nav/carousel/…), one refresh frame every
    // ~2.5 s so the scene doesn't look frozen. The loop stops when
    // settled, so a per-frame dt accumulator can never advance — the breath
    // is a wall-clock timer (see _scheduleBreath) that raises demand and
    // fires a typed 'breath' invalidation on the scheduler. Respects
    // prefers-reduced-motion (frozen entirely) and a hidden tab (the loop is
    // paused; the timer is dropped and re-armed on the resume frame).
    this._scheduleBreath(activity)

    // Always update navigation + world state (cheap), but only render when needed
    const ns = this._storyNav?.getOverallProgress() ?? 0
    const sceneStart = frameTiming ? performance.now() : 0
    const {
      cameraTarget,
      worldState,
      activeConfig: cfg,
      fromConfig: fromCfg,
      toConfig: toCfg,
      sectionIndex: idx,
    } = this.coordinator.updateTransform(ns)
    this.coordinator.update(dt, this._needsRender)
    const sceneDuration = frameTiming ? performance.now() - sceneStart : 0
    // Drive the baku material blend — from→to slot colors + phaseProgress
    // (scroll t) through SplashCube.updateWorldBlend.
    if (this.baku) {
      if (fromCfg && toCfg) {
        this.baku.updateWorldBlend(
          fromCfg.baku.material.color,
          toCfg.baku.material.color,
          fromCfg.baku.material.emissive,
          toCfg.baku.material.emissive,
          worldState.phaseProgress,
        )
      }
    }

    // ContentReveal applies the active section's auto/inverse theme and the
    // jlz:theme-applied listener above keeps the 3D layer in sync.
    // Dispatch section-change on EVERY section index change (not just context).
    // The app shell reveals the matching DOM content; Experience handles the
    // scene-specific light and cube response to this same section event.
    if (idx !== this._prevSectionIndex) {
      const isInitialSectionSync = this._prevSectionIndex === -1
      this._prevSectionIndex = idx
      // The initial sync is excluded because buildScene already applied the
      // intro light target before the first frame.
      if (!isInitialSectionSync && cfg) {
        this.lights.changeSection(cfg)
      }
      const sectionId = cfg?.domSection ?? `section-${idx}`
      // On content pages the sectionId is 'content-N' — it doesn't correspond
      // to any [data-section] DOM element. ContentReveal's sectionHandler
      // guards against this, but we also skip the dispatch here to avoid
      // spurious events + cube face rotation that doesn't make sense on
      // content pages (cube rotation is home-only visual feedback).
      const isHomePage = this._host.page() === 'home'
      if (isHomePage && !isInitialSectionSync) {
        eventBus.emit('jlz:section-change', {
          sectionId,
          context: cfg?.context,
          configId: cfg?.id,
          index: idx,
        })
      }
      // ── Rotate cube to show the face for this section ──
      // 6 sections = 6 cube faces. Each section change animates the cube
      // to its target Y rotation so the corresponding face points to camera.
      if (this.baku) {
        if (isInitialSectionSync) this.baku.snapToFace(idx)
        else this.baku.rotateToFace(idx)
        this._needsRender = true
      }

      // ── Zoom pulse on section change ──
      // Camera FOV dips slightly then returns — "push-in" cinematic feel.
      // Also triggers cube opener (scale pulse 1.0→1.3→1.0) for combined effect.
      if (!isInitialSectionSync) {
        this.camera.pulse(0.05, 0.8)
        this.baku?.triggerOpener()
      }
      this._needsRender = true
    }

    // Context switch (post-processing preset)
    if (cfg && cfg.context !== this.currentSectionContext) {
      // Fog is re-targeted by the transform pass on section arrival —
      // no need to set it here. PostProcessing + FOV still triggered on context change.
      // applyPreset also targets the section grade channels (refraction,
      // shadow/highlight tints) — Renderer.update() crossfades them into the
      // pipeline, so section transitions no longer snap the grade.
      this.renderer.postManager.applyPreset(cfg.id, cfg.post)
      this.camera.setFovOffset(cfg.camFovOffset, cfg.camFovDuration)
      // Subtle camera shake on section transition.
      if (!this._reducedMotion) this.camera.shake(0.02, 0.6)
      this.currentSectionContext = cfg.context
      // Apply the material palette resolved for this section.
      if (this.baku) {
        this.baku.updateMaterial(worldState.bakuMaterial)
      }
      // Follow the Works cards more closely than the other sections.
      const cursorFollow = idx === WORKS_SLOT_INDEX ? 0.22 : 0.15
      this.camera.setCursorFollow(cursorFollow)
    }

    // Works section: the baku gives way to an infinite stream of project cards
    // (BakuCarousel). The carousel is a child of sceneGroups[3] (Works idx 3
    // in 6-section layout) and manages its own visibility via morph.
    // Carousel activity is sampled before the render gate so a morph started
    // by this frame's transform pass advances immediately.
    // Ground plane (floor) — visible ONLY on the bottom visible section.
    // Section index 4 = cube face -Y (bottom) on all pages. On every other
    // section the floor is hidden so the 3D scene floats in void. This gives
    // the bottom section a "grounded" feel while upper sections feel airborne.
    if (this.coordinator) {
      this.ground.setSectionVisible(this.coordinator.currentSectionIndex === 4)
    }

    // Apply camera and renderer work only when explicit demand or active scene
    // behavior requires a frame.
    if (import.meta.env.DEV && this._debugContinuousRendering) this._needsRender = true
    if (this._needsRender) {
      const smoothing = cfg?.camSmoothing ?? DEFAULT_CAMERA_SMOOTHING
      const cameraStart = frameTiming ? performance.now() : 0
      this.camera.updateSmooth(cameraTarget, dt, smoothing)
      this.lights.update(dt)
      this.camera.update(dt)
      const cameraDuration = frameTiming ? performance.now() - cameraStart : 0
      const rendererStart = frameTiming ? performance.now() : 0
      // While the showreel theater is open it OWNS the frame: its private
      // scene renders through the same renderer + post pipeline, the world
      // simply skips a beat and resumes unchanged on close.
      if (!this._showreel.renderFrame(this.renderer, dt, this.camera.instance.aspect)) {
        this.renderer.update(this.scene, this.camera.instance, dt)
      }
      const rendererDuration = frameTiming ? performance.now() - rendererStart : 0
      this.devPanel?.recordRenderFrame()
      frameTiming?.record({
        scene: sceneDuration,
        camera: cameraDuration,
        renderer: rendererDuration,
        total: performance.now() - frameStart,
      })
      // A frame that throws in renderer.update() never marks readiness, so
      // `jlz:webgl-ready` follows the first actual successful draw.
      this._readinessGate?.markRendered()
      // Keep demand raised while any activity remains; otherwise the next
      // scheduler pass can settle.
      if (!anyActivity(activity)) {
        this._needsRender = false
      }
    }

    // ── Auto-reduce particle count when FPS is sustained low ──
    // One-way: once reduced, never auto-restore (GPU spike would re-trigger).
    // Iterates all scene groups, finds JunniParticles via the typed attachment,
    // halves their count. DevPanel shows the reduction (low fps ⚠ indicator).
    if (this._fpsTracker.lowFps && !this._particleReductionApplied && this.coordinator) {
      this._particleReductionApplied = true
      const particles = this.sectionGroups?.works.particles
      if (particles && !particles.isReduced) {
        particles.setCount(Math.floor(particles.baseCount / 2))
      }
    }

    // NOTE: do NOT call requestAnimationFrame here — the persistent Tres
    // loop (driven by the scheduler through the SceneLoopPort) is
    // the one RAF host. Calling rAF on top would double the frame rate
    // and fight the WebGPU swap chain synchronization.
  }

  destroy(): Promise<void> {
    if (this._destroyPromise) return this._destroyPromise
    if (this._destroyed) return Promise.resolve()
    this._destroyed = true
    this._lifecycleGeneration++
    this._readinessGate?.cancel()
    this._readinessGate = null
    const scenePrewarm = this._scenePrewarmPromise
    // Stop frames and callbacks immediately. GPU scene and renderer disposal
    // waits for an in-flight compileAsync prewarm below.
    this._scheduler.destroy()
    this._unsubExternalInvalidate?.()
    this._unsubExternalInvalidate = null
    this._webglFailedUnsub?.()
    this._webglFailedUnsub = null
    this._routeChangeUnsub?.()
    this._routeChangeUnsub = null
    this._pageSectionChangeUnsub?.()
    this._pageSectionChangeUnsub = null
    this._routeGeneration++
    this._reducedMotionUnsub?.()
    this._reducedMotionUnsub = null
    this._cancelBreath()
    this.contentReveal?.destroy()
    this.cursor?.destroy()
    this._rendererRecoveredUnsub?.()
    this._rendererRecoveredUnsub = null
    this._themeAppliedUnsub?.()
    this._themeAppliedUnsub = null
    this._splashEnteredUnsub?.()
    this._splashEnteredUnsub = null
    this.features?.destroy()
    this.features = null

    // Publish the completion promise before owner disposal can trigger any
    // synchronous callbacks that re-enter destroy().
    this._destroyPromise = Promise.resolve().then(() => this.finishDestroy(scenePrewarm))
    return this._destroyPromise
  }

  private async finishDestroy(scenePrewarm: Promise<void> | null): Promise<void> {
    if (scenePrewarm) {
      try {
        await scenePrewarm
      } catch (error) {
        // Prewarm is optional, but resources it touched must finish before
        // the scene and backend owners are released.
        console.warn('[Experience] scene prewarm ended during teardown:', error)
      }
    }
    // Event/RAF owners were stopped synchronously in destroy(); release the
    // scene-facing owners only after compileAsync no longer traverses them.
    // The showreel controller unsubscribes its commands and disposes the
    // theater with the render owner (video element, texture, quad).
    const showreelTeardown = this._showreel.dispose()
    // UI event listeners, menu, overlay and story navigation belong to
    // ExperienceUI.
    // Experience owns these controller lifetimes.
    this.lights?.dispose()
    this.ground?.dispose()
    // Vue owns the ambient pavilion and its borrowed EnvSky material.
    // Declarative boot-static boundary: the baku/intro-frames/trail nodes
    // stay with the Vue host too — the controllers release only their own
    // state + created resources.
    this.baku?.dispose()
    this.particleBurst?.dispose()
    this.drawTrail?.dispose()
    // The registry invalidates pending route-stage imports before renderer
    // teardown, so late completions cannot attach nodes or retain TSL graphs.
    const stageTeardown = this._stages.dispose()
    // Release the render pipeline and abort recovery now. SceneHost's
    // renderer instance is deferred until its declarative Vue owners unmount.
    const rendererTeardown = this.renderer.dispose()
    // ServicesStageOwner owns terminal disposal when the persistent host unmounts.
    this.servicesStage = null
    // Dispose carousel and particle resources before the adopted roots.
    this.sectionGroups?.dispose()
    this.coordinator?.dispose()
    this.devPanel?.dispose()
    delete (window as unknown as { __jlzRuntimeSnapshot?: () => unknown }).__jlzRuntimeSnapshot
    delete (window as unknown as { __jlzRuntimeDestroy?: () => Promise<void> }).__jlzRuntimeDestroy
    this.camera.destroy()
    // Release the observer of Tres's viewport refs on HMR and teardown.
    this._stopSizeWatch?.()
    this._stopSizeWatch = null
    input.destroy()
    this.sfx.dispose()
    // Release the generated PMREM texture through its owner.
    this._environment?.disposeCurrent()

    // Stage ports wait for Vue/Tres to remove each declared subtree before
    // disposing its adopted GPU resources. Keep the backend alive until that
    // release sequence completes; the scheduler is already stopped above.
    const finishRendererTeardown = (): void => {
      // Last-resort sweep for cold-cache failures and in-flight loads that had
      // no owner card yet. In-flight entries self-dispose when they settle.
      disposeAllCaseTextures()
    }
    const results = await Promise.allSettled([showreelTeardown, stageTeardown, rendererTeardown])
    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('[Experience] scene owner teardown failed:', result.reason)
      }
    }
    traceDevLifecycle('experience:async-scene-teardown-complete')
    finishRendererTeardown()
  }
}
