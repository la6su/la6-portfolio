import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
 * Characterization pin for the deliberate second ease in updateTransform
 * (SceneCoordinator.ts, "Deliberate second ease (parity-locked)"): the bg +
 * group-fade path consumes the DOUBLY-eased t so each section's colour holds
 * until mid-transition, while the camera/baku path consumes the singly-eased
 * t. The lock is documentary in production code — this test turns it into a
 * failing check so a future dedupe cannot ship silently.
 *
 * Observables (both public): worldState.phaseProgress carries the single-
 * eased t; the to-group's mesh opacity carries baseOpacity × bgT.
 */
describe('SceneCoordinator updateTransform easing contract', () => {
  let coordinator: SceneCoordinator
  let getContext: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    document.body.dataset.page = 'home'
    getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(canvasContext as unknown as CanvasRenderingContext2D)
    const groups = Array.from({ length: 6 }, () => new THREE.Group())
    // A fully-opaque mesh in group 1 — the fade-in target of the first
    // range transition. baseOpacity is captured on the first pass.
    groups[1]!.add(
      new THREE.Mesh(
        new THREE.BufferGeometry(),
        new THREE.MeshBasicMaterial({ transparent: true }),
      ),
    )
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
    coordinator = new SceneCoordinator(new THREE.Scene(), owners, () => 'home')
    await coordinator.init()
  })

  afterEach(() => {
    coordinator.dispose()
    getContext.mockRestore()
    delete document.body.dataset.page
  })

  it('fades groups with the doubly-eased t while the camera path stays singly-eased', () => {
    // Drive raw t = 0.25 inside the first range transition.
    const [rStart, rEnd] = coordinator.sections[0]!.phaseConfig.range
    const rawT = 0.25
    const scrollValue = rStart + rawT * (rEnd - rStart)

    const easing =
      coordinator.sections[1]!.phaseConfig.scene?.transition?.easing ??
      coordinator.sections[0]!.phaseConfig.scene?.transition?.easing ??
      'ease-in-out'
    const single = applyEasing(rawT, easing)
    const double = applyEasing(single, easing)
    // The pin is only meaningful at a raw t where the two easings diverge.
    expect(double).toBeLessThan(single - 0.05)

    const result = coordinator.updateTransform(scrollValue)

    // Camera/baku path: the result's phaseProgress is the SINGLE-eased t.
    expect(result.worldState.phaseProgress).toBeCloseTo(single, 6)

    // Group-fade path: the to-group mesh opacity is baseOpacity × bgT —
    // the DOUBLE-eased t, strictly darker than the camera-path progress.
    const mesh = coordinator.sceneGroups[1]!.children[0] as THREE.Mesh
    const material = mesh.material as THREE.MeshBasicMaterial
    expect(material.opacity).toBeCloseTo(double, 6)
    expect(material.opacity).toBeLessThan(result.worldState.phaseProgress - 0.05)
  })
})
