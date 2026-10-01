// src/Experience/sceneOwners.ts — the owner-bag contract shared by the
// SceneCoordinator and its scroll-to-world transform algorithm.
//
// Boot owners keep their direct references for the Experience lifetime. The
// registry supplies current references for route stages that are recreated
// on navigation. This shared shape avoids importing the coordinator in either
// pass module.

import type { GroundPlane } from './Scene/GroundPlane'
import type { SectionGroups } from './Scene/SectionGroups'
import type { DrawTrail } from './World/DrawTrail'
import type { SplashCube } from './World/SplashCube'
import type { EnvSphere } from './World/EnvSphere'
import type { ParticleBurst } from './World/ParticleBurst'
import type { BakuCarousel } from './World/BakuCarousel'
import type { ServicesStage } from './World/ServicesStage'
import type { StageRegistry } from './StageRegistry'

export interface SceneCoordinatorOwners {
  ground: GroundPlane
  sectionGroups: SectionGroups
  envSphere: EnvSphere
  baku: SplashCube
  particleBurst: ParticleBurst
  drawTrail: DrawTrail
  carousel: BakuCarousel | null
  stages: StageRegistry
  servicesStage: ServicesStage
}
