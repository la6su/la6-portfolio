// Coordinates story state, scene transforms, route visibility and per-frame
// updates. Experience owns it and passes scene owners as getters so lazily
// replaced route stages are always read from their current owner.

import * as THREE from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import type { Section } from '../core/Section'
import { devDiagnostic } from '../core/devDiagnostic'
import { prefersReducedMotion } from '../core/motionPolicy'
import type { PageId } from '../core/routeManifest'
import { type PhaseConfig } from '../core/WorldConfig'
import { WORKS_SLOT_INDEX } from '../core/worldSlots'
import { SectionStateMachine } from './SectionStateMachine'
import { SceneTransformPass, type WorldTransformResult } from './SceneTransformPass'
import { SceneFramePass, bakuVisibleOnRoute } from './SceneFramePass'
import type { SceneCoordinatorOwners } from './sceneOwners'
import type { ContactTypographyStage } from './World/ContactTypographyStage'
import type { ContactHaloStage } from './World/ContactHaloStage'
import type { ManifestoInkStage } from './World/ManifestoInkStage'

export class SceneCoordinator {
  private _story = new SectionStateMachine()
  private _transform: SceneTransformPass
  private _frame: SceneFramePass
  private _reducedMotion = prefersReducedMotion()
  private sceneRef: THREE.Scene
  private owners: SceneCoordinatorOwners
  private page: () => PageId

  /** The scroll story state (Section instances + configs + arrival index). */
  public get sections(): Section[] {
    return this._story.sections
  }
  public get currentSectionIndex(): number {
    return this._story.currentSectionIndex
  }

  /** DEV diagnostics: ids currently installed for the active page. */
  public get configIds(): readonly string[] {
    return this._story.configs.map((config) => config.id)
  }

  /** Stable section groups used only by the coordinator's route/frame policy. */
  private get sceneGroups(): THREE.Group[] {
    return this.owners.sectionGroups()?.groups ?? []
  }

  // Live owner reads stay private to the coordinator and its passes. UI
  // interactions access those controllers through Experience's UI host port.
  private get contactTypographyStage(): ContactTypographyStage | null {
    return this.owners.contactTypographyStage()
  }
  private get contactHaloStage(): ContactHaloStage | null {
    return this.owners.contactHaloStage()
  }
  private get manifestoInkStage(): ManifestoInkStage | null {
    return this.owners.manifestoInkStage()
  }

  constructor(scene: THREE.Scene, owners: SceneCoordinatorOwners, page: () => PageId) {
    this.sceneRef = scene
    this.owners = owners
    this.page = page
    this._transform = new SceneTransformPass({
      scene,
      story: this._story,
      owners,
      page,
      isReducedMotion: () => this._reducedMotion,
    })
    this._frame = new SceneFramePass({
      owners,
      page,
      currentSectionIndex: () => this._story.currentSectionIndex,
      isReducedMotion: () => this._reducedMotion,
    })
  }

  public async init(): Promise<void> {
    const pageKey = this.page()
    const configs = this._story.beginRoute(pageKey)
    // Route re-entry can reuse the coordinator instance. Invalidate derived
    // caches around the rebuild so lookups and ranges do not retain the
    // previous route's scene contract.
    this._transform.resetForRoute()
    // Apply route visibility before rebuilding sections; the shared cube and
    // Lab object are independent of the section groups below.
    this.syncRouteVisuals()
    this._story.buildSections()

    // ── Apply first section's fog + env sphere colors immediately
    const firstCfg = configs[1] // Intro = index 1 (canonical Lab/Contact finale = 0)
    if (firstCfg) {
      // Inline WorldAtmosphere.setFog — fog not yet set on init, so create new.
      this.sceneRef.fog = new THREE.FogExp2(firstCfg.fog.color.clone(), firstCfg.fog.density)
    }

    // ── Enforce final visibility: only group 1 (intro) visible, all others hidden.
    // This guard runs after ALL group creation to prevent any upstream call
    // (e.g. a premature updateTransform with t=0 showing from+to) from
    // leaking visibility before init() returns.
    this.sceneGroups.forEach((g, i) => {
      g.visible = i === 1 // Intro = index 1
    })

    devDiagnostic(
      'debug',
      '[SceneCoordinator] init — scene group visibility:',
      this.sceneGroups.map((g, i) => `g[${i}]=${g.visible}`),
    )
  }

  /** Rebuild the page-specific section/config contract after SPA navigation. */
  public refreshRouteConfig(): Promise<void> {
    return this.init()
  }

  /**
   * Compile the home Works and one-shot portal materials while the inline
   * splash still covers the scene. They are exposed only to the compiler.
   */
  public async prewarmHomeMedia(
    renderer: WebGPURenderer,
    camera: THREE.Camera,
  ): Promise<void> {
    if (this.page() !== 'home') return

    const group = this.sceneGroups[3]
    if (!group) return
    const burst = this.owners.particleBurst()
    const wasVisible = group.visible
    const wasPortalVisible = burst?.visible ?? false
    group.visible = true
    if (burst) burst.visible = true
    try {
      // Prewarm is an optimisation. Some backends cannot compile before the
      // first render; on failure, the first visible frame compiles on demand.
      await renderer.compileAsync(this.sceneRef, camera)
    } catch {
      // Silent — prewarming is not a startup requirement. The first render
      // will compile shaders on demand (slightly slower first frame only).
    } finally {
      group.visible = wasVisible
      if (burst) burst.visible = wasPortalVisible
    }
  }

  /** Sync the 3D Works composition with CinematicNav's active DOM chapter. */
  public setWorksPlaneStageSection(index: number): void {
    if (this._frame.setWorksPlaneStageSection(index)) this._transform.invalidate()
  }

  /**
   * Contact's foreground chapters own their visual hierarchy. Agros is a quiet
   * map frame, while the final CTA does not need the particle swarm.
   */
  public setContactSceneSection(index: number): void {
    const isContact = this.page() === 'contact'
    const isAgros = isContact && index === 2
    const isFinal = isContact && index === 3

    const particles = this.owners.sectionGroups()?.works.particles
    if (particles) particles.visible = !isAgros
    this.contactTypographyStage?.setActive(isContact && !isFinal)
    // The halo backs the greeting — it shares the flock's chapter gating.
    this.contactHaloStage?.setActive(isContact && !isFinal)
    this._transform.invalidate()
  }

  /**
   * True when any visible scene group hosts JunniParticles.
   * Experience uses this to keep on-demand rendering alive so GPU drift
   * (uTime) advances every frame — without it particles freeze on settled
   * sections (only ambient-breath frames every 2.5s).
   * Currently only Works (home idx 3) creates particles.
   */
  public hasVisibleParticles(): boolean {
    const worksGroup = this.sceneGroups[WORKS_SLOT_INDEX]
    return Boolean(worksGroup?.visible && this.owners.sectionGroups()?.works.particles.visible)
  }

  /**
   * Intentional continuous motion: the glass cube and visible floating words
   * are primary scene objects, not ambient decoration. Experience uses this
   * explicit signal to keep their CPU animation alive under on-demand render.
   */
  public hasVisibleAmbientMotion(): boolean {
    if (this.isReducedMotion) return false
    if (this.owners.envSphere()?.isAnimating) return true
    if (this.owners.baku()?.isAmbientlyAnimated) return true
    const contactTypographyStage = this.contactTypographyStage
    if (contactTypographyStage?.visible && contactTypographyStage.isAnimating) return true
    const contactHaloStage = this.contactHaloStage
    if (contactHaloStage?.visible && contactHaloStage.isAnimating) return true
    const manifestoInkStage = this.manifestoInkStage
    if (manifestoInkStage?.visible && manifestoInkStage.isAnimating) return true
    const servicesStage = this.owners.servicesStage()
    if (servicesStage?.visible && servicesStage.isAnimating) return true
    // The Lab object's authored hover clock is an intentional primary object
    // motion (mirrors the typography stage), not decoration.
    const labGamepad = this.owners.labGamepad()
    if (labGamepad?.visible && labGamepad.isAnimating) return true
    return false
  }

  /** Match the opaque 3D words and the ink halo to the effective contrast. */
  public syncTypographyTheme(isLight: boolean): void {
    this.contactTypographyStage?.setTheme(isLight)
    this.contactHaloStage?.setTheme(isLight)
    this.manifestoInkStage?.setTheme(isLight)
  }

  /** The demand-gated owner frame fan-out. On an idle frame it keeps
   *  route ownership state synchronized without advancing any animation
   *  clock (parity pinned by SceneCoordinator.motionParity). */
  public update(deltaTime: number, needsRender: boolean = true): void {
    this._frame.update(deltaTime, needsRender)
  }

  /** The pooled scroll→world transform pass (range mapping, easing,
   *  group fades, arrival fog, camera/baku/env lerp). The contract is
   *  pinned by SceneCoordinator.routeVisuals/doubleEase/scrollStates. */
  public updateTransform(scrollValue: number): WorldTransformResult {
    return this._transform.updateTransform(scrollValue)
  }

  public resize(width: number, height: number): void {
    // A-001: Propagate resize to scene groups + ground plane.
    // Scene groups: adjust scale for narrow screens (keep aspect ratio).
    const aspect = width / height
    const scale = aspect < 1 ? 0.7 : 1.0 // shrink on portrait
    this.sceneGroups.forEach((g) => {
      g.scale.setScalar(scale)
    })
    // Ground plane: always covers viewport (large geometry, no change needed).
    // Baku: position stays at origin, no resize needed.
    // Atmosphere: fog density stays per-section.
  }

  /** Frame-path delegate: the machine owns the deadline policy. */
  public updateSections(dt: number): void {
    this._story.updateSections(dt)
  }

  // Experience owns scene resources. ServicesStage is the exception: its
  // terminal disposal belongs to ServicesStageOwner.vue on host unmount.

  public dispose(): void {
    this._transform.invalidate()
    this._story.disposeSections()
    // Inline WorldAtmosphere.dispose — null out fog only (EnvSphere owns
    // background).
    this.sceneRef.fog = null
  }

  /** Set the camera used by DrawTrail to unproject pointer coordinates. */
  public setCamera(cam: THREE.Camera): void {
    this._frame.setCamera(cam)
  }

  /** Keep route-specific hero objects isolated from the shared home cube. */
  public syncRouteVisuals(): void {
    const page = this.page()
    const isLab = page === 'lab'
    const baku = this.owners.baku()
    if (baku)
      baku.visible = bakuVisibleOnRoute(page, this.owners.contactCyprusStage()?.isActive ?? false)
    const labGamepad = this.owners.labGamepad()
    if (labGamepad) {
      labGamepad.visible = isLab
      // Every route entry starts from the authored pose — without this reset
      // a mid-hover tilt or crank angle would persist across visits.
      if (isLab) labGamepad.resetMotion?.()
    }
    this._transform.invalidate()
  }

  /** Reduced-motion policy read for the coordinator's own visibility gates. */
  private get isReducedMotion(): boolean {
    return this._reducedMotion
  }

  /** Keep frame-path policy synchronized by the Experience owner. */
  public setReducedMotion(reduced: boolean): void {
    this._reducedMotion = reduced
    this._transform.invalidate()
  }

  /** Get PhaseConfig for a given phase ID. Cached Map lookup on the story. */
  public getConfig(phase: string): PhaseConfig | undefined {
    return this._story.getConfig(phase)
  }
}
