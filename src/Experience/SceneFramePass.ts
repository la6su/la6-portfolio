// src/Experience/SceneFramePass.ts — the demand-gated owner frame fan-out.
//
// The third extraction of the NEXT item 4.1 SceneCoordinator split: the
// per-frame forwarder that advances every scene owner on a demanded frame
// and keeps route ownership state synchronized on idle ones (without
// advancing any animation clock). It owns the camera reference the owners
// need (DrawTrail unprojection, ServicesStage head-tracking) and the
// Works stage's active chapter index. SceneCoordinator keeps the
// frame-facing delegates and the owner read surface.

import * as THREE from 'three'
import type { PageId } from '../core/routeManifest'
import { particlesOf, type SceneCoordinatorOwners } from './sceneOwners'

/** The facts the pass reads per frame. Getters, not values: the route, the
 *  active section and the reduced-motion policy can change between frames. */
interface SceneFramePassContext {
  owners: SceneCoordinatorOwners
  page: () => PageId
  currentSectionIndex: () => number
  isReducedMotion: () => boolean
}

/**
 * The route-static half of the baku visibility contract, shared by the
 * coordinator's syncRouteVisuals and the frame path: baku is a
 * home/manifesto resident — never visible on the Lab or standalone Works
 * route, and it yields while the Contact Cyprus stage owns the scene. The
 * frame path additionally folds the home carousel-morph clause on top of
 * this predicate.
 */
export function bakuVisibleOnRoute(page: PageId, contactCyprusActive: boolean): boolean {
  return page !== 'lab' && page !== 'works' && !(page === 'contact' && contactCyprusActive)
}

export class SceneFramePass {
  private _camera: THREE.Camera | undefined
  private worksPlaneStageSection = 0

  constructor(private readonly _ctx: SceneFramePassContext) {}

  /** Set camera reference for DrawTrail (unproject to world) and the
   *  ServicesStage head-tracking. Phase 8 slices 7–8: the lazy stage
   *  cameras are forwarded directly by Experience (it owns the stages). */
  public setCamera(cam: THREE.Camera): void {
    this._camera = cam
  }

  /** Store the DOM chapter index the Works stage renders. Returns true when
   *  it changed, so the caller can invalidate the transform cache. */
  public setWorksPlaneStageSection(index: number): boolean {
    if (this.worksPlaneStageSection === index) return false
    this.worksPlaneStageSection = index
    this._ctx.owners.worksPlaneStage()?.setActive(this._ctx.page() === 'works', index)
    return true
  }

  public update(deltaTime: number, needsRender: boolean): void {
    // Route identity is stable for this synchronous frame. Snapshot it once
    // so the owner path does not repeat the live page getter at each branch;
    // the getter remains authoritative on the next frame after navigation.
    const page = this._ctx.page()
    // The splash handoff owns its short render window, independent of ambient
    // scene animation. Experience keeps `_needsRender` raised while active.
    const burst = this._ctx.owners.particleBurst()
    if (burst?.isActive) burst.update(deltaTime)

    // ── On-demand: decorative 3D animations only run when rendering ──
    // When idle (settled on a section, no transition, no cursor movement),
    // skip baku rotation, cursor light, draw trail, particle drift, and
    // BakuCarousel updates — the last rendered frame stays on screen.
    // Exception: Experience forces needsRender while hasVisibleParticles().
    if (!needsRender) {
      // Keep route ownership state synchronized, but do not advance any
      // animation clock without a frame. Otherwise a reveal can complete in
      // invisible time and the next demand frame jumps to its end state.
      const worksStage = this._ctx.owners.worksPlaneStage()
      if (worksStage && page === 'works') {
        worksStage.setActive(true, this.worksPlaneStageSection)
      }
      return
    }

    // EnvSphere is a demand-driven owner too: its palette crossfade advertises
    // `isAnimating` through hasVisibleAmbientMotion(), so this update remains
    // on the rendered path until the target weights settle.
    this._ctx.owners.envSphere()?.update(deltaTime)

    const worksStage = this._ctx.owners.worksPlaneStage()
    if (worksStage) {
      worksStage.setActive(page === 'works', this.worksPlaneStageSection)
      worksStage.update(deltaTime)
    }
    const servicesStage = this._ctx.owners.servicesStage()
    if (servicesStage) {
      servicesStage.visible = page === 'services'
      if (servicesStage.visible && this._camera instanceof THREE.PerspectiveCamera) {
        servicesStage.updateState(
          this._camera,
          THREE.MathUtils.clamp(this._ctx.currentSectionIndex() - 1, 0, 3),
          deltaTime,
          this._ctx.isReducedMotion(),
        )
      }
    }
    this._ctx.owners.contactTypographyStage()?.update(deltaTime)
    this._ctx.owners.contactHaloStage()?.update(deltaTime)
    this._ctx.owners.manifestoInkStage()?.update(deltaTime)
    const contactCyprusStage = this._ctx.owners.contactCyprusStage()
    contactCyprusStage?.update(deltaTime)
    // Lab object: authored idle motion advances only on rendered frames; the
    // object itself guards visibility and reduced motion (motion contract in
    // Lab/manifest.ts). Optional calls keep inert experiments legal.
    this._ctx.owners.labGamepad()?.update?.(deltaTime)
    const baku = this._ctx.owners.baku()

    if (!this._ctx.isReducedMotion()) {
      if (baku?.visible) baku.update(deltaTime)
      const isStandaloneWorks = page === 'works'
      const isWorksStoryFrame = this._ctx.currentSectionIndex() === 3
      const trail = this._ctx.owners.drawTrail()
      if (trail && this._camera && (isStandaloneWorks || isWorksStoryFrame)) {
        trail.update(deltaTime, this._camera)
      }
    }

    // ── BakuCarousel (a child of the Works group — its reference + per-frame
    // drive live on Experience) + per-section modules (morph, particles, orbs,
    // …) ──
    // JunniParticles: GPU drift via uTime — only present on Works currently
    // (see Scene/WorksSection.ts header comment).
    const carousel = this._ctx.owners.carousel()
    // SectionGroups owns a stable array for the lifetime of this frame; reuse
    // one snapshot for carousel visibility and particle drift below.
    const groups = this._ctx.owners.sectionGroups()?.groups ?? []
    const carouselGroup = groups[3]
    // Let a departing slider settle its morph even after the section group
    // falls below the visual fade threshold. Otherwise on-demand rendering
    // can freeze the planes half-folded and keep a persistent render reason.
    if (carousel && (carouselGroup?.visible || carousel.isAnimating)) carousel.update(deltaTime)
    if (carousel) {
      if (baku) {
        // Works becomes a pure media field once the cube-face handoff settles:
        // only the planes and the existing particle field remain visible.
        baku.visible =
          bakuVisibleOnRoute(page, contactCyprusStage?.isActive ?? false) &&
          (page !== 'home' || !(carousel.isActive && carousel.morphProgress > 0.82))
      }
    }
    if (!this._ctx.isReducedMotion()) {
      for (const group of groups) {
        if (!group.visible) continue
        // Update JunniParticles — GPU-side drift (Works section).
        const particles = particlesOf(group)
        if (particles && particles.visible !== false) particles.update(deltaTime)
      }
    }
  }
}
