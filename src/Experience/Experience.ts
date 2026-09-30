import * as THREE from 'three'
import { Sizes } from './Sizes'
import { Time } from './Time'
import { Camera } from './Camera'
import { Renderer, type RenderSurface } from './Renderer'
import type { DevPanel } from '../core/DevPanel'
import { ContentReveal } from './ContentReveal'
import { Cursor } from './Cursor'
import type { UIManager } from '../UI/UIManager'
import { input } from './Input'
import { SfxSystem } from '../core/SfxSystem'
import type { PageId } from '../core/routeManifest'
import { NoiseText } from './NoiseText'
import { BlurFade } from './BlurFade'

import { ExperienceUI } from './ExperienceUI'
import { SceneCoordinator } from './SceneCoordinator'
import { carouselOf, particlesOf } from './sceneOwners'
// worldDNA.ts removed — TSL node system never attached (attachWorldDNA never
// called). updateWorldDNAAudio set uniforms nobody read. All dead.
import { observeReducedMotion, prefersReducedMotion } from '../core/motionPolicy'
import { FrameTiming } from '../core/FrameTiming'
import { FpsTracker } from './FpsTracker'
import { SceneEnvironment } from './SceneEnvironment'
import { ShowreelController } from './ShowreelController'
import { WORKS_SLOT_INDEX, WORLD_SLOT_COUNT } from '../core/worldSlots'
import { DEFAULT_CAMERA_SMOOTHING } from '../core/WorldConfig'
import {
  NO_ACTIVITY,
  anyActivity,
  demandSettles,
  idleForAmbientBreath,
  shouldRender,
  type RenderActivity,
} from '../core/renderDemand'
import { RenderScheduler, type FrameReason } from '../core/RenderScheduler'
import { createReadinessGate, type ReadinessGate } from '../core/readinessGate'
import type { SceneHostReady } from '../app/sceneHost'
// ContentReveal owns per-section auto/inverse themes and sends this runtime
// jlz:theme-applied events for 3D synchronisation.
import { eventBus } from '../core/EventBus'
// Phase 8 slice 1: lights + ground are no longer World members — Experience
// creates these scene owners and owns their disposal. Slice 2: the six
// stable section groups are owned by the SectionGroups owner (attached to
// the World before init).
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
import { contentRoot } from '../core/contentRoot'
// DissolveOverlay removed — cover transition in ProjectDetail replaces it.

/**
 * Phase 7: the persistent SceneHost readiness state handed to Experience by
 * `entry-app.ts`. The scene, camera and renderer instances are the ONES
 * owned by the SceneHost (Tres root); Experience adopts them. Phase 8
 * slice 10 removed the `attachWorld` primitive slot — the SceneCoordinator
 * adds its section groups + scene owners to the Tres scene directly.
 * `replaceRenderer` syncs the Tres context after a device-loss recovery.
 *
 * Derived from the bridge's own `SceneHostReady` so a host capability is
 * declared once (sceneHost.ts): Experience drops the Tres context/backend
 * facts it never reads and widens the renderer to its surface contract.
 */
type ExperienceHost = Omit<SceneHostReady, 'context' | 'backend' | 'renderer'> & {
  renderer: RenderSurface
  replaceRenderer(renderer: RenderSurface): void
}

export class Experience {
  scene!: THREE.Scene
  sizes!: Sizes
  /** Per-frame delta clamp — internal to the loop host. */
  private time!: Time
  camera!: Camera
  renderer!: Renderer
  private contentReveal!: ContentReveal
  private cursor!: Cursor
  private _sectionChangeHandler:
    ((payload: import('../core/EventBus').AppEvents['jlz:section-change']) => void) | null = null
  private _themeAppliedUnsub: (() => void) | null = null
  private _splashEnteredUnsub: (() => void) | null = null
  private devPanel: DevPanel | null = null
  private _frameTiming: FrameTiming | null = null
  // Phase 8 slice 10: the scene-coordination engine left the legacy `World`
  // into the SceneCoordinator owner (since split into SectionStateMachine /
  // SceneTransformPass / SceneFramePass — NEXT item 4.1). Experience creates
  // it (buildWorld) and is the single disposal owner; it injects the scene
  // owners as getters over its own fields. The legacy `World` class +
  // `SectionSceneFactory` leave production.
  public coordinator!: SceneCoordinator
  // Phase 8 slice 1: the lights + ground scene owners (created in buildWorld,
  // entering the Tres-owned scene; Experience is the single disposal owner).
  private lights!: CinematicLights
  private ground!: GroundPlane
  // Phase 8 slice 2: the six stable section groups owner (the coordinator's
  // frame pass reads them via the owner getter).
  private sectionGroups!: SectionGroups
  // Phase 8 slice 3: the ambient pavilion owner. Vue owns its construction
  // and terminal disposal; the coordinator forwards its per-frame update.
  private envSphere!: EnvSphere
  // Phase 8 slice 4 → declarative boot-static boundary: the glass cube
  // behavior controller around the BakuCubeOwner node (the frame pass
  // reads/writes it through the owners bag's baku getter).
  private baku!: SplashCube
  // Phase 8 slice 5 → declarative boot-static boundary: the intro light
  // frames + cursor trail behavior controllers around their host nodes (the
  // frame pass reads/writes them through the owners bag's getters).
  private particleBurst!: ParticleBurst
  private drawTrail!: DrawTrail
  // Phase 8 slice 6: the project stream owner. The carousel is attached to the
  // declarative Works root (its disposal lives in
  // the SectionGroups owner's BakuCarousel-first ordering); Experience owns
  // the reference + init, and the frame pass drives it through the owners
  // bag's carousel getter.
  private carousel: BakuCarousel | null = null
  private _carouselInitPromise: Promise<void> | null = null
  // StageRegistry owns the six route stages and their lifecycle.
  private readonly _stages!: StageRegistry
  private servicesStage: ServicesStage | null = null
  // Showreel render mode (ShowreelController.ts): the lazy GPU-side theater,
  // its typed bus commands, the reduced-motion forwarding and the render swap.
  private _showreel!: ShowreelController
  // Phase 8 slice 8 (moved from World): the target Cyprus-active state (the
  // Agros frame replaces the shared cube) + the effective text polarity
  // cached so a lazy Contact stage cannot miss it.
  private _contactCyprusActive = false
  private _contactIsLight = false

  // The frame path's one-time Works-gallery preload gate (read + written only
  // here, so the flag lives on Experience — not on the ExperienceUI host).
  private _projectOverlayPreloaded = false

  // Phase 7 slice 4: the former UI features (cinematic nav, menu, overlay,
  // project controls, UI-facing window handlers) live in ExperienceUI.
  private features!: ExperienceUI
  private readonly _host: ExperienceHost
  private _destroyed = false
  private _lifecycleGeneration = 0

  /** Development-only project navigation delegates to the UI owner. */
  public navigateProject(direction: -1 | 1): void {
    this.features?.navigateProject(direction)
  }
  /** The fullscreen overlay (owned by ExperienceUI). */
  private get overlay() {
    return this.features?.overlay ?? null
  }
  private currentSectionContext: string | null = null
  private _prevSectionIndex = -1
  private _onSizesResize: () => void = () => {}
  private _onRendererRecovered: (() => void) | null = null
  private _onMouseMoveForTrail: (() => void) | null = null
  private _mouseTrailRafPending = false
  private _mouseTrailRafId: number | null = null
  public sfx: SfxSystem = new SfxSystem()
  /** Cinematic story track (owned by ExperienceUI, Phase 7 slice 4). */
  private get _storyNav() {
    return this.features?.storyNav ?? null
  }
  private _needsRender = true // start true to render the first frame
  private _bakuCarouselActive = false // BakuCarousel is morphed/scrolling
  // A4: ambient breathing — one refresh frame every ~2.5 s while the scene
  // stays idle. Phase 7: the loop stops when settled, so the per-frame dt
  // accumulator can no longer advance; the breath is a wall-clock timer that
  // raises demand + fires a typed 'breath' invalidation on the scheduler.
  private _breathTimer: ReturnType<typeof setTimeout> | null = null
  private static readonly AMBIENT_BREATH_INTERVAL = 2.5 // seconds between idle refresh frames
  private _reducedMotion = false // synchronized with prefers-reduced-motion (updated in init)
  private _reducedMotionUnsub: (() => void) | null = null
  // Phase 7 (ADR 0004) / ADR 0005: the single demand-loop policy. The frame
  // callback installs into the persistent Tres loop through the SceneHost
  // port (the renderer's setAnimationLoop boundary is gone); the scheduler
  // still starts the loop on invalidation and stops it after the settled
  // frame (zero idle ticks, zero settled draws). Hidden-tab pause/resume is
  // owned here too.
  private _scheduler!: RenderScheduler
  /** Ecosystem wake path (ADR 0005): Tres/Cientos `invalidate()` demands. */
  private _unsubExternalInvalidate: (() => void) | null = null
  /** Terminal render-failure gate (device-loss budget exhausted). */
  private _onWebGLFailed: (() => void) | null = null
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
  // Procedural IBL environment owner (SceneEnvironment.ts): applied once
  // after renderer.init() and re-applied after a device-loss recovery.
  private _environment!: SceneEnvironment

  // Phase 7 readiness contract: `jlz:webgl-ready` may only fire after the
  // initial scene's FIRST SUCCESSFUL RENDER — the scheduler 'first-frame'
  // invalidation guarantees a frame; the frame resolves this exactly once.
  private _firstRenderResolve: (() => void) | null = null
  private _firstRenderPromise: Promise<void> | null = null
  private _readinessGate: ReadinessGate | null = null
  /** Resolved on the first successful rendered frame. */
  private get firstRender(): Promise<void> {
    if (!this._firstRenderPromise) {
      this._firstRenderPromise = new Promise<void>((resolve) => {
        this._firstRenderResolve = resolve
      })
    }
    return this._firstRenderPromise
  }
  // Auto-reduce: when _lowFps flips true, halve all JunniParticles counts.
  // One-way (never restore) — restoring causes a GPU spike that re-triggers
  // low FPS. User can manually restore via DevPanel (future) or page reload.
  private _particleReductionApplied = false
  // (startAudioHandler removed — AudioSystem deleted, was dead code)

  // SECTION_LABELS removed — the cinematic navigator derives labels from the
  // rendered, translated section headings.
  constructor(
    private _ui: UIManager,
    host: ExperienceHost,
    private page: () => PageId = () => 'home',
  ) {
    this.sizes = new Sizes()
    this.time = new Time()
    // SceneHost is the single scene + camera owner. Experience adopts those
    // instances for cinematic state and never creates a fallback world.
    this._host = host
    this.scene = host.scene
    this.camera = new Camera(this.sizes, host.camera)
    this.renderer = new Renderer(this.sizes)
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
    })
    // The stage registry reads the live route/camera/polarity/motion state at
    // its own lazy-init time — a stage can be created on any route at any
    // moment, so every fact crosses as a getter.
    this._stages = new StageRegistry({
      currentPage: () => this.currentPage(),
      camera: () => this.camera,
      host: () => this._host.stages,
      isContactLight: () => this._contactIsLight,
      isCyprusActive: () => this._contactCyprusActive,
      setCyprusActive: (active) => {
        this._contactCyprusActive = active
      },
      reducedMotion: () => this._reducedMotion,
      syncRouteVisuals: () => this.coordinator.syncRouteVisuals(),
    })

    // Phase 7 slice 4: the former UI features reach the scene through a
    // narrow getter-based port (the scene + owners only exist after init).
    this.features = new ExperienceUI({
      page: () => this.currentPage(),
      coordinator: () => this.coordinator,
      camera: () => this.camera,
      ui: () => this._ui,
      sfx: () => this.sfx,
      raise: (reason) => this._raiseRenderDemand(reason),
      reducedMotion: () => this._reducedMotion,
      // Phase 8 slice 6: the carousel init moved to Experience (World no
      // longer owns scene object init); the UI reaches it through the port.
      ensureCarouselInitialized: () => this.ensureCarouselInitialized(),
      stages: () => this._stages,
    })

    // Phase 7 (ADR 0004) / ADR 0005: construct the single loop policy. The
    // driver edge targets the persistent Tres loop through the SceneHost
    // port — non-null installs the frame callback (window open), null stops
    // the loop (window closed). `autoVisibility` (default, DOM present)
    // pauses the loop while the tab is hidden and resumes it with exactly
    // one invalidation.
    this._scheduler = new RenderScheduler(
      {
        setLoop: (cb) => {
          this._host.loop.onFrame(cb)
          if (cb) this._host.loop.start()
          else this._host.loop.stop()
        },
      },
      { onFrame: (time) => this.update(time), isSettled: () => this._isLoopSettled() },
    )
    // Ecosystem wake path (ADR 0005): Tres/Cientos `invalidate()` calls
    // (CameraControls change events, future helpers) raise the same typed
    // demand as internal activity, so external components can open windows.
    this._unsubExternalInvalidate = this._host.loop.onExternalInvalidate(() =>
      this._raiseRenderDemand('external'),
    )
    // ADR 0005: a terminal device-loss failure stops the loop through the
    // event (the old Renderer.setAnimationLoop(null) boundary is gone).
    this._onWebGLFailed = () => {
      this._renderDisabled = true
      this._scheduler.settleNow()
    }
    eventBus.on('jlz:webgl-failed', this._onWebGLFailed)

    // Wire resize → world (A-001/A-004: World.resize was empty + never called)
    this._onSizesResize = () => {
      this.resizeSceneOwners()
      this._raiseRenderDemand('resize')
    }
    this.sizes.onResize(this._onSizesResize)
  }

  private resizeSceneOwners(): void {
    // Sizes is the single viewport listener. Fan the already-updated snapshot
    // out synchronously so the camera, renderer and route owners observe one
    // coherent frame size. This leaves a single adapter point for the future
    // Tres context-size bridge.
    this.camera?.resize()
    this.renderer?.resize()
    this.coordinator?.resize(this.sizes.width, this.sizes.height)
    // Phase 8 slice 7: the /works stage resize moved out of World.resize —
    // forwarded directly (the stage is lazy; null until /works is reached).
    this._stages.worksPlaneStage?.resize(this.sizes.width, this.sizes.height)
    // Phase 8 slice 8: the Contact typography resize moved out of
    // World.resize — forwarded directly (lazy; null until /contact is
    // reached).
    // The lazy Cyprus stage owns a viewport-dependent map scale and must
    // follow later orientation/address-bar viewport changes too.
    this._stages.contactCyprusStage?.resize(this.sizes.width, this.sizes.height)
  }

  private lifecycleToken(): number {
    return this._lifecycleGeneration
  }

  private isLifecycleCurrent(token: number): boolean {
    return !this._destroyed && token === this._lifecycleGeneration
  }

  private installRendererRecovery(): void {
    if (this._onRendererRecovered) return
    this._onRendererRecovered = () => {
      if (this._destroyed) return
      this._environment.apply()
      if (this._destroyed) return
      this._raiseRenderDemand('recovery')
    }
    eventBus.on('jlz:renderer-recovered', this._onRendererRecovered)
  }

  private _handleReducedMotionChange(reduced: boolean): void {
    if (reduced === this._reducedMotion || this._destroyed) return
    this._reducedMotion = reduced
    this.renderer?.postManager?.setReducedMotion(reduced)
    this.envSphere?.setReducedMotion(reduced)
    this.coordinator?.setReducedMotion(reduced)
    this.lights?.setReducedMotion(reduced)
    this.baku?.setReducedMotion(reduced)
    this.carousel?.setReducedMotion(reduced)
    this.particleBurst?.setReducedMotion(reduced)
    // The six route stages fan out through their registry owner (the Lab
    // object's optional setReducedMotion contract included).
    this._stages?.setReducedMotion(reduced)
    this.drawTrail?.setReducedMotion(reduced)
    this.camera?.setReducedMotion(reduced)
    this._showreel.setReducedMotion(reduced)
    this._storyNav?.setReducedMotion(reduced)
    if (reduced) {
      this._cancelBreath()
      this._scheduler.settleNow()
    } else {
      this._raiseRenderDemand('motion-preference')
    }
  }

  private async buildWorld(token: number): Promise<void> {
    if (!this.isLifecycleCurrent(token)) return
    // Phase 8 slice 10: the scene-coordination engine (previously the
    // `World` class) is the SceneCoordinator. It receives the scene owners as
    // getters over Experience's own fields — the lazy route owners change
    // identity per route, so only a getter stays current. All the
    // temporary `attach*` adapters the World carried for its slices leave
    // production with this owner.
    this.coordinator = new SceneCoordinator(
      this.scene,
      {
        ground: () => this.ground,
        sectionGroups: () => this.sectionGroups,
        envSphere: () => this.envSphere,
        baku: () => this.baku,
        particleBurst: () => this.particleBurst,
        drawTrail: () => this.drawTrail,
        carousel: () => this.carousel,
        worksPlaneStage: () => this._stages.worksPlaneStage,
        contactTypographyStage: () => this._stages.contactTypographyStage,
        contactCyprusStage: () => this._stages.contactCyprusStage,
        contactHaloStage: () => this._stages.contactHaloStage,
        manifestoInkStage: () => this._stages.manifestoInkStage,
        labGamepad: () => this._stages.labGamepad,
        servicesStage: () => this.servicesStage,
      },
      () => this.currentPage(),
    )
    // Phase 8 slice 2: the six stable section groups enter the Tres-owned
    // scene directly under their own owner (fresh per coordinator instance).
    // The coordinator reads them through its sceneGroups getter; init() needs
    // them (carousel prewarm + final visibility), so build before init.
    this.sectionGroups = new SectionGroups(
      this.scene,
      undefined,
      () => this.currentPage(),
      () => this._storyNav?.getSide() ?? 'center',
      this._host.sectionRoots,
    )
    const servicesStage = this._host.servicesStage
    this.servicesStage = servicesStage
    // Phase 8 slice 6: the project stream (BakuCarousel) attaches to the
    // declarative Works root; its reference + init + per-frame drive
    // belong to Experience. The coordinator frame path reads it through the
    // carousel owner getter.
    const worksGroup = this.sectionGroups.at(WORKS_SLOT_INDEX)
    this.carousel = carouselOf(worksGroup) ?? null
    if (this.carousel) this.carousel.onActivity = () => this._raiseRenderDemand('dirty')
    // Phase 8 slice 3: the ambient pavilion (EnvSphere) enters the
    // Tres-owned scene under its own owner; the coordinator frame path
    // forwards its per-frame colour-lerp update.
    const envSphere = this._host.envSphere
    this.envSphere = envSphere
    // Declarative boot-static boundary: the glass cube, the intro light
    // frames and the cursor trail reach the scene through their host nodes
    // (BakuCubeOwner / IntroLightFramesOwner / CursorTrailOwner) — Experience
    // only wraps the behavior controllers around them, so no runtime
    // `scene.add` remains in the boot path. The coordinator frame path gates
    // their visibility and forwards their per-frame updates; init() needs the
    // cube (its syncRouteVisuals sets the visibility).
    this.baku = new SplashCube(this._host.baku)
    this.particleBurst = new ParticleBurst(this._host.introFrames)
    this.drawTrail = new DrawTrail(this._host.cursorTrail)
    // These owners are read by the demand-driven frame path. Construct them
    // before the first async coordinator/prewarm step so an early resize or
    // invalidation can never enter `update()` with an undefined ground/light
    // owner. Their section-dependent configuration is applied below once the
    // coordinator has completed its synchronous setup.
    this.lights = new CinematicLights(this._host.lights)
    this.ground = new GroundPlane(this._host.ground)
    await this.coordinator.init()
    if (!this.isLifecycleCurrent(token)) return
    // Phase 8 slice 6: the home-carousel init await moved out of
    // World.init() to this same boundary. The home stream must finish texture
    // decode before Enter becomes ready (otherwise its first section visit
    // performs image work inside navigation); content deep-links defer setup
    // — ExperienceUI calls the idempotent method on every route change.
    if (this.currentPage() === 'home') await this.ensureCarouselInitialized()
    if (!this.isLifecycleCurrent(token)) return
    // Phase 8 slice 7: the /works stage init moved out of World.init() to this
    // same boundary (lazy — created only when /works is the entry route; the
    // route can dispose it while its texture decode is still pending).
    if (this.currentPage() === 'works') void this._stages.ensureWorksPlaneStageInitialized()
    // Phase 8 slice 8: the Contact typography + Cyprus stage inits moved out of
    // World.init() to this same boundary (lazy — created only when /contact
    // is the entry route; the route can dispose them while their inits are
    // still pending). The Draco decode + transparent material warm-up start
    // while Contact's first frame (or the splash) is on screen, so Agros has
    // no first-use model decode or shader-compile hitch.
    if (this.currentPage() === 'contact') {
      void this._stages.ensureContactTypographyStageInitialized()
      void this._stages.ensureContactHaloStageInitialized()
      // `ensureContactCyprusStageInitialized()` owns the prewarm after its
      // request/identity guard. Do not attach a second continuation here: a
      // stale entry-route promise could otherwise prewarm a newer stage.
      void this._stages.ensureContactCyprusStageInitialized()
    }
    // The /manifesto ink wash follows the same entry-route contract: the
    // initial deep-link fires jlz:route-change before this subscription
    // exists, so the entry route must ensure its own lazy stage here.
    if (this.currentPage() === 'manifesto') void this._stages.ensureManifestoInkStageInitialized()
    if (!this.isLifecycleCurrent(token)) return
    // Phase 8 slice 9: the Lab object's lazy creation moved out of
    // World.syncRouteVisuals() to this same boundary (created once on the first
    // /lab visit; the entry route triggers it here, the UI route handler
    // triggers it on navigation). It is a static object — never disposed per
    // route leave, only on final destroy.
    if (this.currentPage() === 'lab') void this._stages.ensureLabGamepad()
    // Phase 8 slice 10: the World's TresJS primitive slot goes away with the
    // legacy World — the coordinator's sections enter the Tres scene directly
    // (init() adds them); every route-owned lazy stage reaches the scene
    // through its own declarative host port (StageRegistry contracts).
    await this.coordinator.prewarmHomeMedia(this.renderer.instance, this.camera.instance)
    if (!this.isLifecycleCurrent(token)) return
    // Phase 8 slice 1: the lights + ground scene owners. They enter the
    // Tres-owned scene directly (the World no longer constructs or disposes
    // them), and the intro-section steps World.init() used to run for them
    // (first-section light targets + ground color/opacity) run here — still
    // before the first rendered frame, so the boot frame is unchanged.
    const firstCfg = this.coordinator.getConfig(
      this.coordinator.sections[1]?.phaseConfig?.id ?? 'sec_intro',
    )
    if (firstCfg) {
      this.lights.changeSection(firstCfg)
      this.ground.applyInitialConfig(firstCfg.ground)
      // Phase 8 slice 3: EnvSphere starts on section 1 (intro) — default
      // weights match. isLight=false (dark); the first jlz:theme-applied
      // event corrects it.
      this.envSphere.changeSection(1, false)
    }
  }

  private currentPage(): PageId {
    return this.page?.() ?? 'home'
  }

  /** Initialize the home-only carousel once, including after a deep-link
   *  visit. Phase 8 slice 6: moved from World — Experience owns the
   *  carousel reference (see `buildWorld`); World no longer owns scene
   *  object init.
   *
   *  Deliberately NOT on the LazyStage contract (2026-09-25 decision,
   *  closes the NEXT.md "lazy lifecycle consistency" item): the carousel
   *  instance is created and disposed by the SectionGroups owner (works
   *  section factory), not here. LazyStage's failure path calls
   *  `setStage(null)` + `release` — nulling the live scene-graph reference
   *  and releasing an owner that SectionGroups still owns — and its
   *  re-create-on-dispose semantics do not apply to a home-only owner that
   *  is never disposed per route. Only the init retries here; the
   *  conversion would add the second abstraction layer this item was
   *  gated against. */
  public ensureCarouselInitialized(): Promise<void> {
    if (this._carouselInitPromise) return this._carouselInitPromise
    const carousel = this.carousel
    if (!carousel) return Promise.resolve()

    const initPromise = carousel.init().then(
      () => {
        if (import.meta.env.DEV)
          console.info('[Experience] BakuCarousel initialized (works section)')
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
    if (this._destroyed) return
    const token = this.lifecycleToken()
    // Install recovery ownership before the first renderer/world await. A
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
    this.contentReveal = new ContentReveal(() => this.currentPage())
    this.cursor = new Cursor(this.sfx)
    // Phase 7: the cursor's own pointer/hover handlers are loop wake sources
    // (its spring keeps moving after the scene has settled).
    this.cursor.onActivity = () => this._raiseRenderDemand('cursor')
    // Glitch eyebrow — on section change, animate the active section's
    // [data-eyebrow] number with NoiseText random-symbol scramble.
    // Uses data-eyebrow-text attribute as STABLE source (never affected by
    // animation). Reading textContent is unsafe — it could be mid-noise
    // from a previous animation, causing permanent glitch residue.
    this._sectionChangeHandler = (payload) => {
      if (!payload?.sectionId) return
      const section = contentRoot().querySelector(`[data-section="${payload.sectionId}"]`)
      const eyebrow = section?.querySelector<HTMLElement>('[data-eyebrow]')
      if (eyebrow) NoiseText.revealEyebrow(eyebrow)
    }
    eventBus.on('jlz:section-change', this._sectionChangeHandler)

    // After splash is dismissed (Enter click), re-trigger NoiseText on the
    // active section so user sees the eyebrow animation as 3D scene reveals.
    this._splashEnteredUnsub = eventBus.on('jlz:splash-entered', () => {
      this.features.triggerSplashOpener()
      const activeSection =
        (contentRoot().querySelector('.section-active [data-eyebrow]') as HTMLElement | null) ??
        (contentRoot().querySelector('[data-section="intro"] [data-eyebrow]') as HTMLElement | null)
      if (activeSection) NoiseText.revealEyebrow(activeSection, 0.8)
    })
    // Showreel theater commands — DOM chrome (ShowreelConsole) emits over the
    // typed bus; the controller owns the lazy GPU-side stage and the render swap.
    this._showreel.bind()
    await this.renderer.init({
      instance: this._host.renderer,
      canvas: this._host.canvas,
      mode: this._host.mode,
      onInstanceReplaced: (instance) => this._host.replaceRenderer(instance),
    })
    if (!this.isLifecycleCurrent(token)) return
    await this.buildWorld(token)
    if (!this.isLifecycleCurrent(token)) return
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
      // Phase 8 slice 3: the EnvSphere is the Experience-owned scene owner —
      // the coordinator gate below still guards the coordinator-bound syncs.
      if (this.envSphere) {
        if (detail.snap) {
          this.envSphere.snapToSection(sectionIdx, detail.isLight)
        } else {
          this.envSphere.changeSection(sectionIdx, detail.isLight)
        }
      }
      if (this.coordinator) {
        // Experience caches the effective polarity so lazy creation cannot
        // default to white text against a light route background. The live
        // stages' theme fan-out is the coordinator's syncTypographyTheme —
        // one owner per change (was: a second Experience fan-out that
        // re-applied the same theme to typography + halo twice per event).
        this._contactIsLight = detail.isLight
        // Theme-only syncs — skip when just the section moved (same polarity).
        if (detail.themeChanged !== false) {
          this._syncPolaritySurfaces(detail.isLight)
          for (const group of this.coordinator.sceneGroups) {
            const particles = particlesOf(group)
            if (particles) particles.setBlending(!detail.isLight)
          }
        }
        this._raiseRenderDemand('dirty')
      }
    })

    // ContentReveal can resolve the initial polarity before Experience has
    // registered the listener above. Replay that settled DOM state so the
    // ambient pavilion, glass and contact ground never boot one polarity
    // behind the semantic interface.
    const initialIsLight = this.contentReveal.isLight
    this.envSphere.snapToSection(this.coordinator.currentSectionIndex, initialIsLight)
    this._syncPolaritySurfaces(initialIsLight)

    // ── Glassmorphism: studio environment map for realistic glass reflections ──
    // Generated once at init, costs ZERO per frame. The PMREM also benefits
    // the ground plane (subtle reflections). Failure inside the owner
    // preserves the previous environment (see SceneEnvironment.apply).
    this._environment.apply()

    // Phase 7 slice 4: the former UI features (CinematicNav, UIMenu,
    // overlay, project controls, UI-facing window handlers) are created and
    // wired by ExperienceUI at this legacy timing (after world + env).
    this.features.init()

    // DevPanel — created AFTER nav so it can read current section
    if (import.meta.env.DEV) {
      try {
        this._frameTiming = new FrameTiming()
        const { DevPanel: DevPanelCtor } = await import('../core/DevPanel')
        this.devPanel = new DevPanelCtor(this)
        // Dev-only runtime probe: resource snapshot PLUS the single loop
        // driver's diagnostics (Phase 7 acceptance: the loop must be
        // inactive after the settled frame — zero settled draws).
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
            // Settled-idle evidence (Phase 7+ gates): the exact demand state
            // behind the settle decision — which flag (if any) keeps the
            // single loop driver from stopping after the settled frame.
            demand: {
              needsRender: this._needsRender,
              cursorSettled: this.cursor?.isSettled ?? null,
              activity: { ...this._activitySnapshot },
            },
            timing: this._frameTiming?.snapshot() ?? null,
          }
        }
        console.log('[Experience] DevPanel ready — press ` or ~ or Ctrl+D to toggle')
      } catch (e) {
        console.warn('[Experience] DevPanel init failed:', e)
      }
    }

    // Mark the intro section active on init so its DOM content is visible
    // (ContentReveal toggles .section-active on jlz:section-change, but no
    // event fires for the initial section).
    const firstSection = contentRoot().querySelector('[data-section="intro"]')
    firstSection?.classList.add('section-active')
    // Apply initial section theme (intro = light in auto, dark in inverse)
    // ContentReveal.applySectionTheme is private — dispatch section-change
    // so it picks up the initial section. BUT delay NoiseText until splash
    // is dismissed (jlz:splash-entered) — otherwise eyebrow animates behind
    // splash overlay and user never sees it.
    // We emit section-change immediately for ContentReveal (theme + active),
    // but NoiseText handler checks if splash is still visible.
    eventBus.emit('jlz:section-change', {
      sectionId: 'intro',
      context: 'Studio — Home',
      configId: 'sec_intro',
      index: 1,
    })
    // Always prepare project controls — single-page, always needs the Works slider.
    void this.features.ensureProjectControls()
    this.camera.instance.position.set(0, 5, 10)
    this.camera.instance.lookAt(0, 0, 0)
    this.camera.instance.updateProjectionMatrix()
    // Phase 7 (ADR 0004) / ADR 0005: the loop is demand-driven — the
    // scheduler (built in the constructor) owns the frame policy: the frame
    // callback starts on the first 'first-frame' invalidation and stops
    // after the settled frame (zero settled draws), running inside the
    // persistent Tres loop via the SceneHost SceneLoopPort. WebGPURenderer
    // on the WebGPU backend still paces through setAnimationLoop
    // (swap-chain sync) — the driver, not the start/stop policy, is
    // unchanged from Phase 6.
    this._scheduler.invalidate('first-frame')

    // ── DrawTrail: trigger render on mousemove (Works section only) ──
    // DrawTrail.update() runs inside world.update(needsRender) — if
    // _needsRender is false, the trail doesn't update. On the Works section
    // (idx=3), we want the trail to follow the cursor in real time, so we
    // set _needsRender=true on mousemove. Throttled via rAF flag to avoid
    // 200+ events/sec flooding the render loop.
    this._mouseTrailRafPending = false
    this._onMouseMoveForTrail = () => {
      if (this._mouseTrailRafPending) return
      const isWorksStoryFrame = this.coordinator?.currentSectionIndex === WORKS_SLOT_INDEX
      const isStandaloneWorks = this.currentPage() === 'works'
      if (!isWorksStoryFrame && !isStandaloneWorks) return
      this._mouseTrailRafPending = true
      this._mouseTrailRafId = requestAnimationFrame(() => {
        this._mouseTrailRafId = null
        this._mouseTrailRafPending = false
        this._raiseRenderDemand('cursor')
      })
    }
    window.addEventListener('mousemove', this._onMouseMoveForTrail, { passive: true })

    // (AudioSystem removed — was functionally dead: source field never
    //  assigned, getBass/getMid/getTreble had zero callers, update() ran
    //  every frame computing zeros. SfxSystem is alive via Cursor.ts.)

    // Phase 7 slice 4: the former UI features (sound default + toggle,
    // language sync, open-project / project-navigate / route-change /
    // wobble-pulse / page-section / works-plane-tap / goto-section-by-hash
    // handlers, CinematicNav + UIMenu) are wired by ExperienceUI at this
    // legacy init timing — see ExperienceUI.init().

    // Phase 7 readiness contract: await the initial scene's FIRST SUCCESSFUL
    // RENDER. The 'first-frame' invalidation above guarantees a frame (a
    // hidden tab resumes with exactly one invalidation); the bounded timeout
    // keeps the splash from hanging on a path that never renders. The factory
    // return alone never satisfies readiness — entry-app only publishes
    // `jlz:webgl-ready` after this init resolves.
    this._readinessGate = createReadinessGate(this.firstRender, 20000)
    await this._readinessGate.promise
    this._readinessGate = null
  }

  /**
   * Shared polarity surfaces for the theme fan-out: ambient ground, baku and
   * the coordinator's typography sync. The event handler adds the per-group
   * particles blending pass; the init replay adds the envSphere section snap —
   * those stay at their call sites. Optional chaining is deliberate: the init
   * replay can run before the lazy world stages exist.
   */
  private _syncPolaritySurfaces(isLight: boolean): void {
    this.ground?.syncTheme(isLight)
    this.baku?.setTheme(isLight)
    this.coordinator?.syncTypographyTheme(isLight)
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
   * Post-frame settle decision for the single loop driver (ADR 0004): the
   * loop may stop after this frame only when the draw gate would have been
   * a no-op (demand clear AND nothing active — the demandSettles 14-flag
   * set) AND the cursor spring has converged (it needs frames even when the
   * scene is settled). Equivalent to "the next frame would draw nothing".
   */
  private _isLoopSettled(): boolean {
    return (
      this._updateFailed ||
      this._renderDisabled ||
      (!this._needsRender &&
        demandSettles(this._activitySnapshot) &&
        this.cursor?.isSettled !== false)
    )
  }

  // ── A4 ambient breath (wall-clock, Phase 7) ──
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

  update(time: number) {
    // A later invalidation is allowed to make one diagnostic/recovery attempt
    // after a failed frame; the failed frame itself must not keep the loop
    // alive indefinitely.
    this._updateFailed = false
    try {
      this._updateInner(time)
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

  private _updateInner(time: number) {
    const frameTiming = this._frameTiming
    const frameStart = frameTiming ? performance.now() : 0
    this.time.update(time)
    const dt = this.time.delta / 1000
    this._fpsTracker.observe(this.time.delta)
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
    // Compute carousel active state NOW (not from previous frame) — the
    // carousel may have started morphing this frame via setActive() in the
    // transform pass's updateTransform(). If we use stale _bakuCarouselActive from
    // last frame, _needsRender stays false and carousel.update() never
    // runs → morph stalls at ~0.35. See BakuCarousel.ts §update.
    const carousel = this.features.getCarousel()
    this._bakuCarouselActive = carousel?.isAnimating ?? false
    const carouselActive = this._bakuCarouselActive
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
    // Particles only exist on certain sections (Works on home — intro removed
    // them for white-on-white). Their animation is GPU-side via uTime; if
    // on-demand freezes the loop, drift only advances on ambient-breath
    // frames (~2.5s) and looks stuck. Keep rendering while a particle field
    // is on a visible group (respects prefers-reduced-motion).
    const particlesActive =
      !this._reducedMotion && (this.coordinator?.hasVisibleParticles() ?? false)
    const ambientSceneActive =
      !this._reducedMotion && (this.coordinator?.hasVisibleAmbientMotion() ?? false)

    // ── Zoom pulse active ──
    const camPulsing = this.camera.isPulsing

    // The per-frame activity snapshot — the demand decision below is the
    // pure renderDemand contract (single source of the 14-flag OR /
    // 10-flag breath-idle sets, unit-locked against the legacy logic).
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
    // ~2.5 s so the scene doesn't look frozen. Phase 7: the loop stops when
    // settled, so a per-frame dt accumulator can never advance — the breath
    // is a wall-clock timer (see _scheduleBreath) that raises demand and
    // fires a typed 'breath' invalidation on the scheduler. Respects
    // prefers-reduced-motion (frozen entirely) and a hidden tab (the loop is
    // paused; the timer is dropped and re-armed on the resume frame).
    this._scheduleBreath(activity)

    // Always update navigation + world state (cheap), but only render when needed
    const ns = this._storyNav?.getOverallProgress() ?? 0
    const sceneStart = frameTiming ? performance.now() : 0
    const { cameraTarget, worldState } = this.coordinator.updateTransform(ns)
    this.coordinator.update(dt, this._needsRender)
    const sceneDuration = frameTiming ? performance.now() - sceneStart : 0
    // Drive the baku material blend — from→to slot colors + phaseProgress
    // (scroll t) through SplashCube.updateWorldBlend.
    if (this.baku) {
      const fromCfg = this.coordinator.getConfig(
        this.coordinator.sections[this.coordinator.currentSectionIndex]?.phaseConfig?.id ??
          'sec_intro',
      )
      // Blend toward the next slot (clamped to the last of the six).
      const toIdx = Math.min(this.coordinator.currentSectionIndex + 1, WORLD_SLOT_COUNT - 1)
      const toCfg = this.coordinator.getConfig(
        this.coordinator.sections[toIdx]?.phaseConfig?.id ?? 'sec_intro',
      )
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

    // (setEnvAndCamera call removed — SplashCube method was a no-op.
    //  envMap comes from CubeCamera, cameraPos was never read.)

    // ContentReveal applies the active section's auto/inverse theme and the
    // jlz:theme-applied listener above keeps the 3D layer in sync.
    const idx = this.coordinator.currentSectionIndex
    // Give the frame pass the camera ref for DrawTrail unprojection + the
    // ServicesStage head-tracking (every frame — the pass re-reads it).
    this.coordinator.setCamera(this.camera.instance)
    // Phase 8 slice 7: the /works stage camera moved out of World.setCamera —
    // forwarded directly (the stage is lazy; null until /works is reached).
    this._stages.worksPlaneStage?.setCamera(this.camera.instance)
    // Phase 8 slice 8: the Contact stage cameras moved out of World.setCamera
    // (Experience owns both lazy stages).
    this._stages.contactCyprusStage?.setCamera(this.camera.instance)

    // Dispatch section-change on EVERY section index change (not just context).
    // This triggers NoiseText title animation for the new section + cube face rotation.
    if (idx !== this._prevSectionIndex) {
      const isInitialSectionSync = this._prevSectionIndex === -1
      this._prevSectionIndex = idx
      const cfgForSection = this.coordinator.getConfig(worldState.currentPhase)
      // Phase 8 slice 1: section-arrival light targets (was the legacy
      // transform's arrival step — same frame, same config).
      // Initial sync excluded: buildWorld's intro step already set the target
      // (exactly what the legacy World.init did).
      if (!isInitialSectionSync && cfgForSection) {
        this.lights.changeSection(cfgForSection)
      }
      const sectionId = cfgForSection?.domSection ?? `section-${idx}`
      // On content pages the sectionId is 'content-N' — it doesn't correspond
      // to any [data-section] DOM element. ContentReveal's sectionHandler
      // guards against this, but we also skip the dispatch here to avoid
      // spurious events + cube face rotation that doesn't make sense on
      // content pages (cube rotation is home-only visual feedback).
      const isHomePage = this.currentPage() === 'home'
      if (isHomePage && !isInitialSectionSync) {
        eventBus.emit('jlz:section-change', {
          sectionId,
          context: cfgForSection?.context,
          configId: cfgForSection?.id,
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
    const cfg = this.coordinator.getConfig(worldState.currentPhase)
    if (cfg && cfg.context !== this.currentSectionContext) {
      // Fog is re-targeted by the transform pass on section arrival —
      // no need to set it here. PostProcessing + FOV still triggered on context change.
      // applyPreset also targets the section grade channels (refraction, border,
      // shadow/highlight tints) — Renderer.update() crossfades them into the
      // pipeline, so section transitions no longer snap the grade.
      this.renderer.postManager.applyPreset(cfg.id, cfg.post)
      this.camera.setFovOffset(cfg.camFovOffset, cfg.camFovDuration)
      // Subtle camera shake on section transition — softer (was 0.04, 0.4)
      if (!this._reducedMotion) this.camera.shake(0.02, 0.6)
      this.currentSectionContext = cfg.context
      // A-009: Apply Baku material from worldState (was computed but never applied)
      if (this.baku) {
        this.baku.updateMaterial(worldState.bakuMaterial)
      }
      // A-015: Per-section cursor follow (works=0.22, others=0.15)
      const cursorFollow = idx === WORKS_SLOT_INDEX ? 0.22 : 0.15
      this.camera.setCursorFollow(cursorFollow)
    }

    // Works section: the baku gives way to an infinite stream of project cards
    // (BakuCarousel). The carousel is a child of sceneGroups[3] (Works idx 3
    // in 6-section layout) and manages its own visibility via morph.
    const showGallery = cfg?.ui?.showGallery ?? false
    // Note: _bakuCarouselActive is now computed BEFORE the _needsRender check
    // (above, in the activity snapshot) — was a race condition where stale
    // value caused carousel.update() to never run, morph stalled at ~0.35.
    // Sync FullscreenOverlay (DOM UI layer) — fullscreen opens on card click.
    if (this.overlay && showGallery && !this._projectOverlayPreloaded) {
      this._projectOverlayPreloaded = true
      // Preload the first project into the overlay (hidden until card click).
      // Uses preload() NOT open() — open() calls UIkit.modal().show() which
      // adds the uk-open class (making the overlay visible). preload() only
      // sets content without showing, so the overlay stays hidden.
      // Prepare the same authored texture that the first 3D plane uses. The
      // overlay can then decode it before the first plane-to-modal handoff.
      this.features.onProjectSelect(0, true)
    }
    // Ground plane (floor) — visible ONLY on the bottom visible section.
    // Section index 4 = cube face -Y (bottom) on all pages. On every other
    // section the floor is hidden so the 3D scene floats in void. This gives
    // the bottom section a "grounded" feel while upper sections feel airborne.
    if (this.coordinator) {
      this.ground.setSectionVisible(this.coordinator.currentSectionIndex === 4)
    }

    // Per-section camera smoothing — only when rendering. The gate is the
    // contract's shouldRender (demand set OR anything active); it is 1:1
    // with the legacy `if (this._needsRender)` because the anyActivity OR
    // above already raised the flag for any active source.
    if (shouldRender(this._needsRender, activity)) {
      const smoothing = cfg?.camSmoothing ?? DEFAULT_CAMERA_SMOOTHING
      const cameraStart = frameTiming ? performance.now() : 0
      this.camera.updateSmooth(cameraTarget, dt, smoothing)
      this.lights.update(dt)
      this.camera.update(dt)
      const cameraDuration = frameTiming ? performance.now() - cameraStart : 0
      // (AudioSystem.update() removed — AudioSystem deleted, was dead code)
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
      // Phase 7 readiness: the initial scene's FIRST SUCCESSFUL RENDER — a
      // frame that threw in renderer.update() never resolves the gate
      // (update() catches and keeps booting), so `jlz:webgl-ready` can only
      // fire after a real draw. Resolves exactly once.
      if (this._firstRenderResolve) {
        const resolve = this._firstRenderResolve
        this._firstRenderResolve = null
        resolve()
      }
      // Clear the demand flag only when nothing is still active — the same
      // 14-flag settle set, now the contract's demandSettles (unit-locked
      // against the legacy inline AND-NOT).
      if (demandSettles(activity)) {
        this._needsRender = false
      }
    }

    // ── Auto-reduce particle count when FPS is sustained low ──
    // One-way: once reduced, never auto-restore (GPU spike would re-trigger).
    // Iterates all scene groups, finds JunniParticles via the typed attachment,
    // halves their count. DevPanel shows the reduction (low fps ⚠ indicator).
    if (this._fpsTracker.lowFps && !this._particleReductionApplied && this.coordinator) {
      this._particleReductionApplied = true
      for (const group of this.coordinator.sceneGroups) {
        const particles = particlesOf(group)
        if (particles && !particles.isReduced) {
          particles.setCount(Math.floor(particles.baseCount / 2))
        }
      }
    }

    // NOTE: do NOT call requestAnimationFrame here — the persistent Tres
    // loop (driven by the scheduler through the SceneLoopPort, ADR 0005) is
    // the one RAF host. Calling rAF on top would double the frame rate
    // and fight the WebGPU swap chain synchronization.
  }

  // (setSplashProgress removed — dead method, zero callers. Was calling
  //  SplashCube.setProgress which was also a no-op.)
  // (triggerSplashOpener removed — Phase 7 slice 4: owned by ExperienceUI.)

  destroy() {
    if (this._destroyed) return
    this._destroyed = true
    this._lifecycleGeneration++
    this._readinessGate?.cancel()
    this._readinessGate = null
    // Text effects can outlive a route root while their DOM remains attached;
    // stop their RAF/timeout owners before tearing down the scene and UI.
    NoiseText.disposeAll()
    BlurFade.disposeAll()
    // Stop the loop driver FIRST — RenderScheduler.destroy() closes the
    // Tres loop window through the SceneHost port, clears the frame
    // callback, the visibility listener and any pending invalidation, so no
    // frame fires after dispose().
    this._scheduler.destroy()
    this._unsubExternalInvalidate?.()
    this._unsubExternalInvalidate = null
    if (this._onWebGLFailed) {
      eventBus.off('jlz:webgl-failed', this._onWebGLFailed)
      this._onWebGLFailed = null
    }
    this._reducedMotionUnsub?.()
    this._reducedMotionUnsub = null
    this._cancelBreath()
    // Cancel pending rAF for mouse trail (prevents fire after destroy)
    this._mouseTrailRafPending = false
    if (this._mouseTrailRafId !== null) {
      cancelAnimationFrame(this._mouseTrailRafId)
      this._mouseTrailRafId = null
    }
    if (this._onMouseMoveForTrail) {
      window.removeEventListener('mousemove', this._onMouseMoveForTrail)
      this._onMouseMoveForTrail = null
    }
    this.contentReveal?.destroy()
    this.cursor?.destroy()
    if (this._sectionChangeHandler) {
      eventBus.off('jlz:section-change', this._sectionChangeHandler)
      this._sectionChangeHandler = null
    }
    if (this._onRendererRecovered) {
      eventBus.off('jlz:renderer-recovered', this._onRendererRecovered)
      this._onRendererRecovered = null
    }
    if (this._themeAppliedUnsub) {
      this._themeAppliedUnsub()
      this._themeAppliedUnsub = null
    }
    if (this._splashEnteredUnsub) {
      this._splashEnteredUnsub()
      this._splashEnteredUnsub = null
    }
    // The showreel controller unsubscribes its commands and disposes the
    // theater with the render owner (video element, texture, quad).
    this._showreel?.dispose()
    // Phase 7 slice 4: the former UI features (their window listeners, the
    // menu, the overlay and the story nav) tear down through ExperienceUI.
    this.features.destroy()
    // Phase 8 slice 1: the lights + ground scene owners (Experience is their
    // single disposal owner — the legacy World no longer disposes them).
    this.lights?.dispose()
    this.ground?.dispose()
    // Vue owns the ambient pavilion and its borrowed EnvSky material.
    // Declarative boot-static boundary: the baku/intro-frames/trail nodes
    // stay with the Vue host too — the controllers release only their own
    // state + created resources.
    this.baku?.dispose()
    this.particleBurst?.dispose()
    this.drawTrail?.dispose()
    // The six route-owned lazy stages die through their registry owner, in
    // the legacy destroy order (works plane → typography → cyprus → halo →
    // ink → lab). disposeLazyStage retires in-flight import generations
    // before renderer teardown, so a module resolving after root destruction
    // can neither attach a stage nor retain its TSL material graph.
    this._stages?.dispose()
    // ServicesStageOwner owns terminal disposal when the persistent host unmounts.
    this.servicesStage = null
    // Phase 8 slice 2: the stable section groups owner (BakuCarousel-first
    // disposal ordering + Works particle texture live in the owner).
    this.sectionGroups?.dispose()
    this.coordinator?.dispose()
    // Last-resort sweep for cold-cache failures and in-flight loads that had
    // no owner card yet. In-flight entries self-dispose when they settle.
    disposeAllCaseTextures()
    this.devPanel?.dispose()
    delete (window as unknown as { __jlzRuntimeSnapshot?: () => unknown }).__jlzRuntimeSnapshot
    delete (window as unknown as { __jlzRuntimeDestroy?: () => void }).__jlzRuntimeDestroy
    // Renderer.dispose() cleans up the resize listener AND the pipeline
    // AND the renderer instance (was previously only instance.dispose()).
    this.renderer.dispose()
    this.camera.destroy()
    // Sizes + Input own window listeners — clean them up to avoid leaks
    // on hot-reload (Vite HMR) and on explicit teardown.
    this.sizes.destroy()
    input.destroy()
    this.sfx.dispose()
    // The scene environment PMREM texture — disposed + reference cleared by
    // its owner (was a leak on HMR teardown before the owner existed).
    this._environment?.disposeCurrent()
  }

  // (ensureProjectControls / getCarousel / onProjectSelect removed — Phase 7
  //  slice 4: owned by ExperienceUI. The BakuCarousel card click is the SOLE
  //  entry point for the fullscreen FullscreenOverlay, as before.)
}
