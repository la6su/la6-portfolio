import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SectionState } from '../core/Section'
import { sectionIndexAt } from '../core/storyProgress'
import { SceneCoordinator } from '../Experience/SceneCoordinator'
import type { SceneCoordinatorOwners } from '../Experience/sceneOwners'
import type { SectionGroups } from '../Experience/Scene/SectionGroups'
import type { SceneTransitionEasing } from '../core/WorldConfig'

const canvasContext = {
  fillStyle: '',
  globalAlpha: 1,
  fillRect: vi.fn(),
}

/** Mirror of the coordinator's private _applyEasing (the parity contract). */
function applyEasing(t: number, easing: SceneTransitionEasing): number {
  const clamped = THREE.MathUtils.clamp(t, 0, 1)
  if (easing === 'ease-out') return 1 - Math.pow(1 - clamped, 3)
  return clamped * clamped * (3 - 2 * clamped)
}

/**
 * Characterization pin for the scroll-driven section state machine inside
 * updateTransform, recorded BEFORE the SceneCoordinator split so the
 * thresholds survive the move as failing checks rather than prose:
 *
 * - the from-section is promoted READY → VIEWING (0.8s deadline) on the
 *   first pass at any t; the flip lands only when updateSections(dt)
 *   advances the pending deadline;
 * - the to-section is promoted only once the eased t passes 0.1;
 * - the from-section retires VIEWING → PASSED (0.5s deadline) once the
 *   eased t passes 0.7;
 * - the active-section arrival (the pure sectionIndexAt midpoint rule)
 *   writes the coordinator's currentSectionIndex and re-targets the scene
 *   fog to the active config, reusing the FogExp2 instance init created.
 */
describe('SceneCoordinator scroll state machine contract', () => {
  let coordinator: SceneCoordinator
  let scene: THREE.Scene
  let getContext: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    document.body.dataset.page = 'home'
    getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(canvasContext as unknown as CanvasRenderingContext2D)
    scene = new THREE.Scene()
    const groups = Array.from({ length: 6 }, () => new THREE.Group())
    const owners: SceneCoordinatorOwners = {
      ground: () => null,
      sectionGroups: () => ({ groups }) as unknown as SectionGroups,
      envSphere: () => null,
      baku: () => null,
      particleBurst: () => null,
      drawTrail: () => null,
      carousel: () => null,
      worksPlaneStage: () => null,
      contactTypographyStage: () => null,
      contactCyprusStage: () => null,
      contactHaloStage: () => null,
      manifestoInkStage: () => null,
      labGamepad: () => null,
      servicesStage: () => null,
    }
    coordinator = new SceneCoordinator(scene, owners, () => 'home')
    await coordinator.init()
  })

  afterEach(() => {
    coordinator.dispose()
    getContext.mockRestore()
    delete document.body.dataset.page
  })

  /** Scroll value that sits `rawT` into the first range transition. */
  function scrollAt(rawT: number): number {
    const [rStart, rEnd] = coordinator.sections[0]!.phaseConfig.range
    return rStart + rawT * (rEnd - rStart)
  }

  /** Scroll value that sits `rawT` into the second range transition (the
   *  first one whose to-section starts READY — section 1 is force-VIEWING
   *  by the init intro rule). */
  function scrollAtSecondRange(rawT: number): number {
    const [rStart, rEnd] = coordinator.sections[1]!.phaseConfig.range
    return rStart + rawT * (rEnd - rStart)
  }

  function firstTransitionEasing(): SceneTransitionEasing {
    return (
      coordinator.sections[1]!.phaseConfig.scene?.transition?.easing ??
      coordinator.sections[0]!.phaseConfig.scene?.transition?.easing ??
      'ease-in-out'
    )
  }

  it('starts on the intro section (index 1) before any scroll', () => {
    expect(coordinator.currentSectionIndex).toBe(1)
  })

  it('promotes the from-section READY to VIEWING on the first pass, flipped by updateSections', () => {
    coordinator.updateTransform(scrollAt(0.25))

    // switchState is a plain deadline: the discrete state stays READY until
    // updateSections advances the 0.8s pending flip. Coarse steps keep the
    // pin clear of the exact-deadline float dust.
    expect(coordinator.sections[0]!.state).toBe(SectionState.READY)
    coordinator.updateSections(0.5)
    expect(coordinator.sections[0]!.state).toBe(SectionState.READY)
    coordinator.updateSections(0.5)
    expect(coordinator.sections[0]!.state).toBe(SectionState.VIEWING)
  })

  it('promotes the to-section only once the eased t passes 0.1', () => {
    // Section 2 is the first to-section that starts READY (section 1 is
    // force-VIEWING by the init intro rule), so drive the second transition.
    const easing =
      coordinator.sections[2]!.phaseConfig.scene?.transition?.easing ??
      coordinator.sections[1]!.phaseConfig.scene?.transition?.easing ??
      'ease-in-out'
    const below = applyEasing(0.02, easing)
    expect(below).toBeLessThan(0.1)

    coordinator.updateTransform(scrollAtSecondRange(0.02))
    expect(coordinator.sections[2]!.state).toBe(SectionState.READY)
    coordinator.updateSections(1)
    expect(coordinator.sections[2]!.state).toBe(SectionState.READY)

    const above = applyEasing(0.25, easing)
    expect(above).toBeGreaterThan(0.1)
    coordinator.updateTransform(scrollAtSecondRange(0.25))
    coordinator.updateSections(1)
    expect(coordinator.sections[2]!.state).toBe(SectionState.VIEWING)
  })

  it('retires the from-section VIEWING to PASSED once the eased t passes 0.7', () => {
    const easing = firstTransitionEasing()
    coordinator.updateTransform(scrollAt(0.25))
    coordinator.updateSections(1)
    expect(coordinator.sections[0]!.state).toBe(SectionState.VIEWING)

    const past = applyEasing(0.7, easing)
    expect(past).toBeGreaterThan(0.7)
    coordinator.updateTransform(scrollAt(0.7))

    // PASSED carries a 0.5s deadline.
    coordinator.updateSections(0.3)
    expect(coordinator.sections[0]!.state).toBe(SectionState.VIEWING)
    coordinator.updateSections(0.3)
    expect(coordinator.sections[0]!.state).toBe(SectionState.PASSED)
  })

  it('writes the arrival index and re-targets the fog without recreating it', () => {
    coordinator.updateTransform(scrollAt(0.05))

    const fog = scene.fog
    expect(fog).toBeInstanceOf(THREE.FogExp2)

    const activeIndex = sectionIndexAt(scrollAt(0.05), coordinator.sections.length)
    expect(coordinator.currentSectionIndex).toBe(activeIndex)

    const activeConfig = coordinator.sections[activeIndex]!.phaseConfig
    expect((fog as THREE.FogExp2).color.equals(activeConfig.fog.color)).toBe(true)
    expect((fog as THREE.FogExp2).density).toBe(activeConfig.fog.density)

    // A later arrival to a different section reuses the same fog instance.
    const activeIndex2 = sectionIndexAt(scrollAt(0.95), coordinator.sections.length)
    coordinator.updateTransform(scrollAt(0.95))
    if (activeIndex2 !== activeIndex) {
      expect(scene.fog).toBe(fog)
      const nextConfig = coordinator.sections[activeIndex2]!.phaseConfig
      expect((scene.fog as THREE.FogExp2).color.equals(nextConfig.fog.color)).toBe(true)
      expect(coordinator.currentSectionIndex).toBe(activeIndex2)
    }
  })
})
