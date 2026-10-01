// src/Experience/sceneOwners.ts — the owner-bag contract shared by the
// SceneCoordinator and its scroll-to-world transform algorithm.
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
