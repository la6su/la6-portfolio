// SceneHost publishes the initialized Tres context and lifecycle ports to
// Experience after the renderer and backend are ready.

import type * as THREE from 'three'
import type { TresContext } from '@tresjs/core'
import type { BackendFacts, FinalMode } from '../core/rendererBackend'
import type { PageId } from '../core/routeManifest'
import type { UnifiedRenderSurface } from '../core/unifiedRenderer'
import type { CinematicLightsNodes } from '../Experience/World/Lights'
import type { GroundPlaneNode } from '../Experience/Scene/GroundPlane'
import type { Group } from 'three'
import type { ServicesStage } from '../Experience/World/ServicesStage'
import type { EnvSphere } from '../Experience/World/EnvSphere'
import type { WorksPlaneStage } from '../Experience/World/WorksPlaneStage'
import type { WorksInstallation } from '../Experience/World/WorksInstallation'
import type { ContactHaloStage } from '../Experience/World/ContactHaloStage'
import type { ContactTypographyStage } from '../Experience/World/ContactTypographyStage'
import type { ManifestoInkStage } from '../Experience/World/ManifestoInkStage'
import type { ContactCyprusStage } from '../Experience/World/ContactCyprusStage'
import type { LabExperimentObject } from '../Experience/Lab/manifest'
import type { BakuCubeNodes } from '../Experience/World/SplashCube'
import type { IntroLightFramesNodes } from '../Experience/World/ParticleBurst'
import type { CursorTrailNodes } from '../Experience/World/DrawTrail'
import type { JunniParticles } from '../Experience/World/JunniParticles'
import type { BakuCarousel } from '../Experience/World/BakuCarousel'
import type { ShowreelTheater } from '../Experience/World/ShowreelTheater'

/**
 * Adapter between the demand scheduler and Tres's render loop.
 */
export interface SceneLoopPort {
  /** Install (or clear) the scheduler's frame callback (delta in ms). */
  onFrame(callback: ((deltaMs: number) => void) | null): void
  /** Open the scheduler window: resume the Tres-owned RAF. */
  start(): void
  /** Close the scheduler window: pause the Tres-owned RAF (zero idle ticks). */
  stop(): void
  /**
   * Register (or clear) the ecosystem wake handler. Fired when Tres/Cientos
   * code calls the renderer-manager `invalidate()` (CameraControls change
   * events, future Cientos helpers) so the scheduler can open a window.
   * Returns the unsubscribe function.
   */
  onExternalInvalidate(handler: (() => void) | null): () => void
}

/**
 * The mount/unmount boundary one declarative stage exposes to the runtime
 * (SceneHost slots; see stageSlot.ts for the shared implementation).
 */
export interface StagePort<T> {
  mount(object: T): Promise<void>
  unmount(object: T): Promise<void>
}

/**
 * The Works plane stage is a two-level boundary: the stage is mounted first
 * and owns its installation child, which never outlives its stage.
 */
interface WorksStagePort {
  mountStage(stage: WorksPlaneStage): Promise<void>
  unmountStage(stage: WorksPlaneStage): Promise<void>
  mountInstallation(stage: WorksPlaneStage, installation: WorksInstallation): Promise<void>
  unmountInstallation(stage: WorksPlaneStage, installation: WorksInstallation): Promise<void>
}

/** The declarative stage ports the Vue host exposes to the Experience runtime.
 *  Every route-owned lazy stage mounts through one of these (the uniform
 *  declarative boundary — no runtime `scene.add`). */
export interface SceneStagePorts {
  works: WorksStagePort
  contactHalo: StagePort<ContactHaloStage>
  manifestoInk: StagePort<ManifestoInkStage>
  contactTypography: StagePort<ContactTypographyStage>
  contactCyprus: StagePort<ContactCyprusStage>
  labGamepad: StagePort<LabExperimentObject>
  particles: StagePort<JunniParticles>
  carousel: StagePort<BakuCarousel>
  showreelTheater: StagePort<ShowreelTheater>
}

/** The readiness state published once the persistent Tres root is live. */
export interface SceneHostReady {
  /** Current semantic page from the persistent Vue Router instance. */
  page: () => PageId
  /** Whether Lab CameraControls currently own the shared camera pose. */
  isLabCameraActive: () => boolean
  /** The Tres-owned scene (`context.scene.value`) — the one THREE.Scene. */
  scene: THREE.Scene
  /** The mounted Tres context (loop/size/camera managers). */
  context: TresContext
  /** The actual renderer instance after init + backend inspection. */
  renderer: UnifiedRenderSurface
  /** The persistent canvas element (Vue-owned DOM, e2e `canvas.canvas`). */
  canvas: HTMLCanvasElement
  /** The one camera instance (owned by SceneHost, wrapped by Experience). */
  camera: THREE.PerspectiveCamera
  /** Final backend mode after the software-adapter policy decision. */
  mode: FinalMode
  /** Actual backend facts after init (backend parity evidence). */
  backend: BackendFacts
  lights: CinematicLightsNodes
  ground: GroundPlaneNode
  /** All static roots are mounted before the ready bridge settles. */
  sectionRoots: readonly Group[]
  /** The Vue lifecycle owns construction and teardown of this adopted stage. */
  servicesStage: ServicesStage
  /** The Vue lifecycle owns construction and teardown of this ambient owner. */
  envSphere: EnvSphere
  /** Declarative boot-static nodes: the behavior controllers Experience
   *  constructs around them never touch the scene graph (no runtime
   *  `scene.add` in the boot path). */
  baku: BakuCubeNodes
  introFrames: IntroLightFramesNodes
  cursorTrail: CursorTrailNodes
  /** Loop bridge driven by the demand scheduler through Tres. */
  loop: SceneLoopPort
  /** Declarative stage mount/unmount boundaries (one port per stage family). */
  stages: SceneStagePorts
}

interface SceneHostState {
  settled: boolean
  resolve?: (value: SceneHostReady) => void
  reject?: (error: unknown) => void
  context: TresContext | null
  rendererOwner?: (renderer: UnifiedRenderSurface, mode: FinalMode) => void
}

const state: SceneHostState = { settled: false, context: null }

/** One-shot signal for the persistent Tres root. */
export const sceneHost = {
  ready: new Promise<SceneHostReady>((resolve, reject) => {
    state.resolve = resolve
    state.reject = reject
  }),
  get isSettled(): boolean {
    return state.settled
  },
  resolve(value: SceneHostReady): void {
    if (state.settled) return
    state.settled = true
    state.context = value.context
    state.resolve?.(value)
  },
  reject(error: unknown): void {
    if (state.settled) return
    state.settled = true
    state.reject?.(error)
  },
  /**
   * Swap the live renderer after a device-loss recovery (or a software
   * adapter re-creation outside SceneHost). Tres 5.9 keeps the renderer as
   * a plain value on the manager, so the swap is a plain assignment; the
   * RenderScheduler keeps driving the replacement through the Renderer
   * owner boundary.
   */
  replaceRenderer(renderer: UnifiedRenderSurface, mode: FinalMode): void {
    if (state.context) state.context.renderer.instance = renderer
    state.rendererOwner?.(renderer, mode)
  },
  /**
   * Register the Vue host's live-renderer slot. Renderer recovery happens
   * behind the Experience owner boundary, so the host must follow the
   * replacement before a later Vue unmount disposes its resources.
   */
  bindRendererOwner(owner: (renderer: UnifiedRenderSurface, mode: FinalMode) => void): () => void {
    state.rendererOwner = owner
    return () => {
      if (state.rendererOwner === owner) state.rendererOwner = undefined
    }
  },
}

/**
 * Test-only: restore the pristine one-shot state so a fresh module-scoped
 * bridge can be exercised again (the production bridge settles exactly once
 * per page).
 */
export function __resetSceneHostForTests(): void {
  state.settled = false
  state.context = null
  state.resolve = undefined
  state.reject = undefined
  state.rendererOwner = undefined
  // A new one-shot promise with fresh settle hooks.
  ;(
    sceneHost as {
      ready: Promise<SceneHostReady>
    }
  ).ready = new Promise<SceneHostReady>((resolve, reject) => {
    state.resolve = resolve
    state.reject = reject
  })
}
