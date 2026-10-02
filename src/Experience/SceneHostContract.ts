// Contract implemented by the persistent Vue/Tres SceneHost and consumed by
// Experience after the renderer and backend are ready.

import type * as THREE from 'three'
import type { TresContext } from '@tresjs/core'
import type { BackendFacts, FinalMode } from '../core/rendererBackend'
import type { PageId } from '../core/routeManifest'
import type { UnifiedRenderSurface } from '../core/unifiedRenderer'
import type { CinematicLightsNodes } from './World/Lights'
import type { GroundPlaneNode } from './Scene/GroundPlane'
import type { Group } from 'three'
import type { ServicesStage } from './World/ServicesStage'
import type { EnvSphere } from './World/EnvSphere'
import type { WorksPlaneStage } from './World/WorksPlaneStage'
import type { WorksInstallation } from './World/WorksInstallation'
import type { ContactHaloStage } from './World/ContactHaloStage'
import type { ContactTypographyStage } from './World/ContactTypographyStage'
import type { ManifestoInkStage } from './World/ManifestoInkStage'
import type { ContactCyprusStage } from './World/ContactCyprusStage'
import type { LabExperimentObject } from './Lab/manifest'
import type { BakuCubeNodes } from './World/SplashCube'
import type { IntroLightFramesNodes } from './World/ParticleBurst'
import type { CursorTrailNodes } from './World/DrawTrail'
import type { JunniParticles } from './World/JunniParticles'
import type { BakuCarousel } from './World/BakuCarousel'
import type { ShowreelTheater } from './World/ShowreelTheater'

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
   * code calls the renderer-manager `invalidate()` (Lab controls change
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
  mountStage(stage: WorksPlaneStage, isCurrent: () => boolean): Promise<void>
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
  /** Whether Lab controls currently own the shared camera pose. */
  isLabCameraActive: () => boolean
  /** The Tres-owned scene (`context.scene.value`) — the one THREE.Scene. */
  scene: THREE.Scene
  /** The mounted Tres context (loop/size/camera managers). */
  context: TresContext
  /** The actual renderer instance after init + backend inspection. */
  renderer: UnifiedRenderSurface
  /** Keep Tres's manager and the Vue teardown owner aligned after recovery. */
  replaceRenderer(renderer: UnifiedRenderSurface, mode: FinalMode): void
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
