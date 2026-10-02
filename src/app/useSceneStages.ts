import { createStageSlot } from './stageSlot'
import type { Group } from 'three'
import type { SceneStagePorts } from './sceneHost'
import type { ContactCyprusStage } from '../Experience/World/ContactCyprusStage'
import type { ContactHaloStage } from '../Experience/World/ContactHaloStage'
import type { ContactTypographyStage } from '../Experience/World/ContactTypographyStage'
import type { LabExperimentObject } from '../Experience/Lab/manifest'
import type { ManifestoInkStage } from '../Experience/World/ManifestoInkStage'
import type { WorksInstallation } from '../Experience/World/WorksInstallation'
import type { WorksPlaneStage } from '../Experience/World/WorksPlaneStage'
import type { JunniParticles } from '../Experience/World/JunniParticles'
import type { BakuCarousel } from '../Experience/World/BakuCarousel'
import type { ShowreelTheater } from '../Experience/World/ShowreelTheater'

export function useSceneStages(isAlive: () => boolean, getWorksRoot: () => Group | Promise<Group>) {
  const worksStageSlot = createStageSlot<WorksPlaneStage>({ isAlive })
  const worksInstallationSlot = createStageSlot<WorksInstallation>({ isAlive })
  const contactHaloSlot = createStageSlot<ContactHaloStage>({ isAlive })
  const manifestoInkSlot = createStageSlot<ManifestoInkStage>({ isAlive })
  const contactTypographySlot = createStageSlot<ContactTypographyStage>({ isAlive })
  const contactCyprusSlot = createStageSlot<ContactCyprusStage>({ isAlive })
  const labGamepadSlot = createStageSlot<LabExperimentObject>({ isAlive })
  const particlesSlot = createStageSlot<JunniParticles>({ isAlive })
  const carouselSlot = createStageSlot<BakuCarousel>({ isAlive })
  const showreelTheaterSlot = createStageSlot<ShowreelTheater>({ isAlive })

  const stages: SceneStagePorts = {
    works: {
      mountStage: async (stage, isCurrent) => {
        if (!isAlive() || !isCurrent()) return
        const root = await getWorksRoot()
        if (!isAlive() || !isCurrent()) return
        stage.mount(root)
        await worksStageSlot.mount(stage)
      },
      unmountStage: async (stage) => {
        if (worksStageSlot.object.value !== stage) return
        worksInstallationSlot.object.value = null
        await worksStageSlot.unmount(stage)
      },
      mountInstallation: (stage, installation) => {
        if (worksStageSlot.object.value !== stage) return Promise.resolve()
        return worksInstallationSlot.mount(installation)
      },
      unmountInstallation: (stage, installation) => {
        if (worksStageSlot.object.value !== stage) return Promise.resolve()
        return worksInstallationSlot.unmount(installation)
      },
    },
    contactHalo: contactHaloSlot,
    manifestoInk: manifestoInkSlot,
    contactTypography: contactTypographySlot,
    contactCyprus: contactCyprusSlot,
    labGamepad: labGamepadSlot,
    particles: particlesSlot,
    carousel: carouselSlot,
    showreelTheater: showreelTheaterSlot,
  }

  /** Drop every Vue-declared route node when the persistent host is disposed. */
  const clear = (): void => {
    worksInstallationSlot.object.value = null
    worksStageSlot.object.value = null
    contactHaloSlot.object.value = null
    manifestoInkSlot.object.value = null
    contactTypographySlot.object.value = null
    contactCyprusSlot.object.value = null
    labGamepadSlot.object.value = null
    particlesSlot.object.value = null
    carouselSlot.object.value = null
    showreelTheaterSlot.object.value = null
  }

  return {
    stages,
    clear,
    declarativeWorksStage: worksStageSlot.object,
    declarativeWorksInstallation: worksInstallationSlot.object,
    declarativeContactHalo: contactHaloSlot.object,
    declarativeManifestoInk: manifestoInkSlot.object,
    declarativeContactTypography: contactTypographySlot.object,
    declarativeContactCyprus: contactCyprusSlot.object,
    declarativeLabGamepad: labGamepadSlot.object,
    declarativeParticles: particlesSlot.object,
    declarativeCarousel: carouselSlot.object,
    declarativeShowreelTheater: showreelTheaterSlot.object,
  }
}
