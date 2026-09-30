// src/Experience/SceneCoordinator.ts — Phase 8 slice 10: the scene-coordination
// engine left the legacy `World` (six-section state machine, scroll transform
// and the per-frame coordination body). Experience owns the coordinator and is
// the single disposal owner; it injects the scene owners as getters over its own
// fields (the lazy route owners change identity per route, so a direct reference
// would go stale). With this slice the legacy `World` class and
// `SectionSceneFactory` leave production (Phase 8 completion) — no production
// caller remains. NEXT item 4.1 later split the three extracted bodies into
// their own owners: SectionStateMachine (scroll story state),
// SceneTransformPass (pooled scroll transform) and SceneFramePass (demand-gated
// owner fan-out) — this file keeps the delegates, the owner read surface and
// route/scene policy.

import * as THREE from 'three'
import type { Section } from '../core/Section'
import { prefersReducedMotion } from '../core/motionPolicy'
import type { PageId } from '../core/routeManifest'
import { type PhaseConfig } from '../core/WorldConfig'
import { SectionStateMachine } from './SectionStateMachine'
import { SceneTransformPass, type WorldTransformResult } from './SceneTransformPass'
import { SceneFramePass, bakuVisibleOnRoute } from './SceneFramePass'
import { particlesOf, type SceneCoordinatorOwners } from './sceneOwners'
import type { SplashCube } from './World/SplashCube'
import type { ParticleBurst } from './World/ParticleBurst'
import type { BakuCarousel } from './World/BakuCarousel'
import type { WorksPlaneStage } from './World/WorksPlaneStage'
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

  /** The stable section groups (empty before the SectionGroups owner is built).
   *  Public read accessor: Experience's theme handler + low-fps particle
   *  reduction iterate the groups directly. */
  public get sceneGroups(): THREE.Group[] {
    return this.owners.sectionGroups()?.groups ?? []
  }

  // ── Public owner read surface (replaces the legacy `World` adapter getters) ──
  // Experience creates + disposes every owner; ExperienceUI + the Experience
  // frame path read them through these getters (narrow read surface, no stored
  // reference — always live after Experience.init() has built the owners).
  public get baku(): SplashCube | null {
    return this.owners.baku()
  }
  public get particleBurst(): ParticleBurst | null {
    return this.owners.particleBurst()
  }
  public get carousel(): BakuCarousel | null {
    return this.owners.carousel()
  }
  public get worksPlaneStage(): WorksPlaneStage | null {
    return this.owners.worksPlaneStage()
  }
  public get contactTypographyStage(): ContactTypographyStage | null {
    return this.owners.contactTypographyStage()
  }
  public get contactHaloStage(): ContactHaloStage | null {
    return this.owners.contactHaloStage()
  }
  public get manifestoInkStage(): ManifestoInkStage | null {
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
    // Phase 8 slice 10: the route-specific visibility gate runs before the
    // sections are rebuilt below (matches the legacy World ordering) — it
    // toggles the shared cube + Lab object and is independent of the
    // sections added below.
    this.syncRouteVisuals()
    this._story.buildSections()

    // Phase 8 slice 1: ground init (intro config) + first-section light targets
    // live in Experience (it owns the GroundPlane + CinematicLights owners).

    // ── Apply first section's fog + env sphere colors immediately
    const firstCfg = configs[1] // Intro = index 1 (canonical Lab/Contact finale = 0)
    if (firstCfg) {
      // Inline WorldAtmosphere.setFog — fog not yet set on init, so create new.
      this.sceneRef.fog = new THREE.FogExp2(firstCfg.fog.color.clone(), firstCfg.fog.density)
      // Phase 8 slice 3: the EnvSphere intro step (section 1, dark) lives in
      // Experience (it owns the EnvSphere scene owner).
    }

    // ── Enforce final visibility: only group 1 (intro) visible, all others hidden.
    // This guard runs after ALL group creation to prevent any upstream call
    // (e.g. a premature updateTransform with t=0 showing from+to) from
    // leaking visibility before init() returns.
    this.sceneGroups.forEach((g, i) => {
      g.visible = i === 1 // Intro = index 1
    })

    // Phase 8 slice 6: the home-carousel init (the stream must finish texture
    // decode before Enter becomes ready) lives in Experience — it owns the
    // carousel reference and awaits it at the same boundary (buildWorld).
    // Phase 8 slice 7: the /works stage init lives in Experience (it owns the
    // lazy stage; the route can still enter on /works before init resolves).
    // Phase 8 slice 8: the Contact typography + Cyprus stage inits live in
    // Experience (it owns both lazy stages; the route can enter /contact
    // before their init resolves).
    if (import.meta.env.DEV) {
      console.debug(
        '[SceneCoordinator] init — scene group visibility:',
        this.sceneGroups.map((g, i) => `g[${i}]=${g.visible}`),
      )
    }
  }

  /** Rebuild the page-specific section/config contract after SPA navigation. */
  public refreshRouteConfig(): Promise<void> {
    return this.init()
  }

  /**
   * Compile the home Works and one-shot portal materials while the inline
   * splash still covers the scene. They are exposed only to the compiler.
   */
  public async prewarmHomeMedia(renderer: object, camera: THREE.Camera): Promise<void> {
    const compiler = renderer as {
      compileAsync?: (scene: THREE.Scene, camera: THREE.Camera) => Promise<unknown>
      compile?: (scene: THREE.Scene, camera: THREE.Camera) => void
    }
    if (this.page() !== 'home') return
    // Phase 8 slice 6: the carousel init await lives in Experience (it owns the
    // reference); buildWorld awaits it before calling this method.

    const group = this.sceneGroups[3]
    if (!group) return
    const burst = this.owners.particleBurst()
    const wasVisible = group.visible
    const wasPortalVisible = burst?.visible ?? false
    group.visible = true
    if (burst) burst.visible = true
    try {
      // Prewarm is an optimisation. Some backends (WebGLRenderer fallback
      // before first render) don't have a render stack yet → compile throws.
      // Guard with a feature check + silent skip on failure.
      if (compiler.compileAsync) {
        await compiler.compileAsync(this.sceneRef, camera)
      } else if (compiler.compile) {
        compiler.compile(this.sceneRef, camera)
      }
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
   * map frame, while the final CTA does not need the legacy HELLO flock.
   */
  public setContactSceneSection(index: number): void {
    const isContact = this.page() === 'contact'
    const isAgros = isContact && index === 2
    const isFinal = isContact && index === 3

    for (const group of this.sceneGroups) {
      const particles = particlesOf(group)
      if (particles) particles.visible = !isAgros
    }
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
   * Currently only Works (home idx 3) creates particles; Intro removed them
   * (white-on-white AdditiveBlending was invisible).
   */
  public hasVisibleParticles(): boolean {
    for (const group of this.sceneGroups) {
      if (!group.visible) continue
      const particles = particlesOf(group)
      if (particles?.visible) return true
    }
    return false
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
    // Phase 8 slice 7: the /works stage resize is forwarded directly by
    // Experience (it owns the stage).
    // Phase 8 slice 8: the Contact typography resize is forwarded directly by
    // Experience (it owns the stage).
    // Ground plane: always covers viewport (large geometry, no change needed).
    // Baku: position stays at origin, no resize needed.
    // Atmosphere: fog density stays per-section.
  }

  /** Frame-path delegate: the machine owns the deadline policy. */
  public updateSections(dt: number): void {
    this._story.updateSections(dt)
  }

  // Phase 8 slice 2: the stable section groups (incl. the BakuCarousel dispose
  // ordering + the Works particle texture) are owned + disposed by the
  // Experience-owned SectionGroups owner.
  // Phase 8 slices 3–9: every scene owner's GPU resources are disposed by
  // Experience (it owns the owners). ServicesStage is the exception: its
  // terminal disposal belongs to ServicesStageOwner.vue on persistent-host
  // unmount, so dispose() must not reach it through the owners bag.

  public dispose(): void {
    this._transform.invalidate()
    this._story.disposeSections()
    // Inline WorldAtmosphere.dispose — null out fog only (EnvSphere owns
    // background).
    this.sceneRef.fog = null
  }

  /** Set camera reference for DrawTrail (unproject to world).
   *  Phase 8 slice 7: the /works stage camera is forwarded directly by
   *  Experience (it owns the stage).
   *  Phase 8 slice 8: the Contact typography + Cyprus stage cameras are forwarded
   *  directly by Experience (it owns both stages). */
  public setCamera(cam: THREE.Camera): void {
    this._frame.setCamera(cam)
  }

  /** Keep route-specific hero objects isolated from the shared home cube.
   *  Phase 8 slice 9: the Lab object's lazy creation lives in Experience
   *  (it owns the lifecycle); the visibility gate reads the owner reference. */
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
