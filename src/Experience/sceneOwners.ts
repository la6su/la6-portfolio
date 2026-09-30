// src/Experience/sceneOwners.ts — the owner-bag contract shared by the
// SceneCoordinator and its two passes (SceneTransformPass, SceneFramePass).
//
// Experience injects getters over its own fields — the lazy route owners
// (Works / Contact stages, Lab object) change identity per route, so only a
// getter stays current. The contract lives in its own module so the passes
// can type their owner access without importing the coordinator (no cycles).

import type { GroundPlane } from './Scene/GroundPlane'
import type { SectionGroups } from './Scene/SectionGroups'
import type { DrawTrail } from './World/DrawTrail'
import type { SplashCube } from './World/SplashCube'
import type { EnvSphere } from './World/EnvSphere'
import type { ParticleBurst } from './World/ParticleBurst'
import type { BakuCarousel } from './World/BakuCarousel'
import type { WorksPlaneStage } from './World/WorksPlaneStage'
import type { ContactTypographyStage } from './World/ContactTypographyStage'
import type { ContactCyprusStage } from './World/ContactCyprusStage'
import type { ContactHaloStage } from './World/ContactHaloStage'
import type { ManifestoInkStage } from './World/ManifestoInkStage'
import type { LabExperimentObject } from './Lab/manifest'
import type { ServicesStage } from './World/ServicesStage'
import type { JunniParticles } from './World/JunniParticles'
import type { Group, Texture } from 'three'

export interface SectionGroupAttachments {
  particles?: JunniParticles
  carousel?: BakuCarousel
  ownedTextures?: Texture[]
}

const SECTION_ATTACHMENTS = new WeakMap<Group, SectionGroupAttachments>()

export function setSectionGroupAttachments(
  group: Group,
  attachments: SectionGroupAttachments,
): void {
  SECTION_ATTACHMENTS.set(group, attachments)
}

export function sectionGroupAttachmentsOf(group: Group): SectionGroupAttachments | undefined {
  return SECTION_ATTACHMENTS.get(group)
}

export function clearSectionGroupAttachments(group: Group): void {
  SECTION_ATTACHMENTS.delete(group)
}

export interface SceneCoordinatorOwners {
  ground: () => GroundPlane | null
  sectionGroups: () => SectionGroups | null
  envSphere: () => EnvSphere | null
  baku: () => SplashCube | null
  particleBurst: () => ParticleBurst | null
  drawTrail: () => DrawTrail | null
  carousel: () => BakuCarousel | null
  worksPlaneStage: () => WorksPlaneStage | null
  contactTypographyStage: () => ContactTypographyStage | null
  contactCyprusStage: () => ContactCyprusStage | null
  contactHaloStage: () => ContactHaloStage | null
  manifestoInkStage: () => ManifestoInkStage | null
  labGamepad: () => LabExperimentObject | null
  servicesStage: () => ServicesStage | null
}

/**
 * The typed group attachment contract written by WorksSection — one read for
 * every consumer (the frame pass, visibility gates, theme and low-fps sweeps).
 */
export function particlesOf(group: Group): JunniParticles | undefined {
  return sectionGroupAttachmentsOf(group)?.particles
}

/** Typed read for the Works root's carousel attachment. */
export function carouselOf(group: Group | undefined): BakuCarousel | undefined {
  return group ? sectionGroupAttachmentsOf(group)?.carousel : undefined
}
