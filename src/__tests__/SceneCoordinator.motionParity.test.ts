import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SceneCoordinator } from '../Experience/SceneCoordinator'
import { setSectionGroupAttachments, type SceneCoordinatorOwners } from '../Experience/sceneOwners'
import type { SectionGroups } from '../Experience/Scene/SectionGroups'
import type { ContactCyprusStage } from '../Experience/World/ContactCyprusStage'
import type { ContactTypographyStage } from '../Experience/World/ContactTypographyStage'
import type { WorksPlaneStage } from '../Experience/World/WorksPlaneStage'
import type { JunniParticles } from '../Experience/World/JunniParticles'

/**
 * The reduced-motion / demand-frame parity contracts of the coordinator's
 * frame forwarder, exercised through the real constructor (the former
 * prototype seeding broke the moment constructor-built owners moved in —
 * the seam is the real wiring, not a field bag).
 */
describe('SceneCoordinator reduced-motion particle parity', () => {
  const disposers: Array<() => void> = []

  afterEach(() => {
    while (disposers.length) disposers.pop()!()
  })

  function makeCoordinator(
    matches: boolean,
    update: ReturnType<typeof vi.fn>,
    particleVisible: boolean = true,
  ): SceneCoordinator {
    const group = new THREE.Group()
    setSectionGroupAttachments(group, {
      particles: { update, visible: particleVisible } as unknown as JunniParticles,
    })
    const owners: SceneCoordinatorOwners = {
      ground: () => null,
      sectionGroups: () => ({ groups: [group] }) as unknown as SectionGroups,
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
    const coordinator = new SceneCoordinator(new THREE.Scene(), owners, () => 'home')
    coordinator.setReducedMotion(matches)
    disposers.push(() => coordinator.dispose())
    return coordinator
  }

  it('does not report hidden particle owners as visible activity', () => {
    const group = new THREE.Group()
    const particles = new THREE.Group()
    particles.visible = false
    setSectionGroupAttachments(group, { particles: particles as unknown as JunniParticles })
    const owners: SceneCoordinatorOwners = {
      ground: () => null,
      sectionGroups: () => ({ groups: [group] }) as unknown as SectionGroups,
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
    const coordinator = new SceneCoordinator(new THREE.Scene(), owners, () => 'contact')
    disposers.push(() => coordinator.dispose())

    expect(coordinator.hasVisibleParticles()).toBe(false)
    particles.visible = true
    expect(coordinator.hasVisibleParticles()).toBe(true)
  })

  it('does not advance particle drift when reduced motion is enabled', () => {
    const update = vi.fn()
    const coordinator = makeCoordinator(true, update)

    coordinator.update(0.25)

    expect(update).not.toHaveBeenCalled()
  })

  it('keeps particle drift active when reduced motion is disabled', () => {
    const update = vi.fn()
    const coordinator = makeCoordinator(false, update)

    coordinator.update(0.25)

    expect(update).toHaveBeenCalledOnce()
    expect(update).toHaveBeenCalledWith(0.25)
  })

  it('does not advance hidden particle drift', () => {
    const update = vi.fn()
    const coordinator = makeCoordinator(false, update, false)

    coordinator.update(0.25)

    expect(update).not.toHaveBeenCalled()
  })

  it('does not advance route-owned animation clocks on an idle frame', () => {
    const worksSetActive = vi.fn()
    const worksUpdate = vi.fn()
    const typographyUpdate = vi.fn()
    const cyprusUpdate = vi.fn()
    const owners: SceneCoordinatorOwners = {
      ground: () => null,
      sectionGroups: () => ({ groups: [] }) as unknown as SectionGroups,
      envSphere: () => null,
      baku: () => null,
      particleBurst: () => null,
      drawTrail: () => null,
      carousel: () => null,
      worksPlaneStage: () =>
        ({ setActive: worksSetActive, update: worksUpdate }) as unknown as WorksPlaneStage,
      contactTypographyStage: () =>
        ({ update: typographyUpdate }) as unknown as ContactTypographyStage,
      contactCyprusStage: () => ({ update: cyprusUpdate }) as unknown as ContactCyprusStage,
      contactHaloStage: () => null,
      manifestoInkStage: () => null,
      labGamepad: () => null,
      servicesStage: () => null,
    }
    const coordinator = new SceneCoordinator(new THREE.Scene(), owners, () => 'works')
    disposers.push(() => coordinator.dispose())

    coordinator.update(0.25, false)

    expect(worksSetActive).toHaveBeenCalledWith(true, 0)
    expect(worksUpdate).not.toHaveBeenCalled()
    expect(typographyUpdate).not.toHaveBeenCalled()
    expect(cyprusUpdate).not.toHaveBeenCalled()
  })

  it('updates the ambient palette only on a demanded frame', () => {
    const envUpdate = vi.fn()
    const envSphere = { isAnimating: false, update: envUpdate }
    const owners: SceneCoordinatorOwners = {
      ground: () => null,
      sectionGroups: () => ({ groups: [] }) as unknown as SectionGroups,
      envSphere: () => envSphere as never,
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
    const coordinator = new SceneCoordinator(new THREE.Scene(), owners, () => 'home')
    disposers.push(() => coordinator.dispose())

    coordinator.update(0.25, false)
    expect(envUpdate).not.toHaveBeenCalled()

    coordinator.update(0.25, true)
    expect(envUpdate).toHaveBeenCalledOnce()
    expect(envUpdate).toHaveBeenCalledWith(0.25)
  })

  it('snapshots route and scene owners once per active update pass', () => {
    const pageReader = vi.fn(() => 'works' as const)
    const worksSetActive = vi.fn()
    const worksUpdate = vi.fn()
    const bakuReader = vi.fn(() => null)
    const cyprusReader = vi.fn(() => null)
    const groupsReader = vi.fn(() => ({ groups: [] }) as unknown as SectionGroups)
    const owners: SceneCoordinatorOwners = {
      ground: () => null,
      sectionGroups: groupsReader,
      envSphere: () => null,
      baku: bakuReader,
      particleBurst: () => null,
      drawTrail: () => null,
      carousel: () => null,
      worksPlaneStage: () =>
        ({ setActive: worksSetActive, update: worksUpdate }) as unknown as WorksPlaneStage,
      contactTypographyStage: () => null,
      contactCyprusStage: cyprusReader,
      contactHaloStage: () => null,
      manifestoInkStage: () => null,
      labGamepad: () => null,
      servicesStage: () => null,
    }
    const coordinator = new SceneCoordinator(new THREE.Scene(), owners, pageReader)
    disposers.push(() => coordinator.dispose())

    coordinator.update(0.25)

    expect(pageReader).toHaveBeenCalledOnce()
    expect(bakuReader).toHaveBeenCalledOnce()
    expect(cyprusReader).toHaveBeenCalledOnce()
    expect(groupsReader).toHaveBeenCalledOnce()
    expect(worksSetActive).toHaveBeenCalledWith(true, 0)
    expect(worksUpdate).toHaveBeenCalledWith(0.25)
  })
})
