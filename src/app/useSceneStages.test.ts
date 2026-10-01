import { isProxy } from 'vue'
import { Group } from 'three'
import { describe, expect, it } from 'vitest'
import type { ContactHaloStage } from '../Experience/World/ContactHaloStage'
import type { WorksInstallation } from '../Experience/World/WorksInstallation'
import type { WorksPlaneStage } from '../Experience/World/WorksPlaneStage'
import { useSceneStages } from './useSceneStages'

describe('scene stage ports', () => {
  it('mounts raw stages and rejects stale parent or child requests', async () => {
    const root = new Group()
    const slots = useSceneStages(() => true, () => root)
    let adoptedRoot: Group | null = null
    const stage = {
      mount: (node: Group) => {
        adoptedRoot = node
      },
    } as unknown as WorksPlaneStage
    const staleStage = {} as WorksPlaneStage
    const installation = {} as WorksInstallation

    await slots.stages.works.mountStage(stage)
    await slots.stages.works.mountInstallation(stage, installation)
    expect(adoptedRoot).toBe(root)
    expect(slots.declarativeWorksInstallation.value).toBe(installation)
    expect(isProxy(slots.declarativeWorksInstallation.value)).toBe(false)

    await slots.stages.works.unmountInstallation(staleStage, installation)
    await slots.stages.works.unmountStage(staleStage)
    expect(slots.declarativeWorksInstallation.value).toBe(installation)

    await slots.stages.works.unmountStage(stage)
    expect(slots.declarativeWorksInstallation.value).toBeNull()
  })

  it('does not mount a stage after the persistent host begins teardown', async () => {
    let alive = true
    const slots = useSceneStages(() => alive, () => new Group())
    const stage = {} as ContactHaloStage

    await slots.stages.contactHalo.mount(stage)
    expect(slots.declarativeContactHalo.value).toBe(stage)

    alive = false
    const lateStage = {} as ContactHaloStage
    await slots.stages.contactHalo.mount(lateStage)
    expect(slots.declarativeContactHalo.value).toBe(stage)
  })

  it('does not attach Works to a root that resolves after host teardown', async () => {
    let alive = true
    let resolveRoot!: (root: Group) => void
    const root = new Promise<Group>((resolve) => {
      resolveRoot = resolve
    })
    const slots = useSceneStages(() => alive, () => root)
    let mounted = false
    const stage = {
      mount: () => {
        mounted = true
      },
    } as unknown as WorksPlaneStage

    const mounting = slots.stages.works.mountStage(stage)
    alive = false
    resolveRoot(new Group())
    await mounting

    expect(mounted).toBe(false)
    expect(slots.declarativeWorksStage.value).toBeNull()
  })

  it('clears every declarative route slot during persistent host teardown', () => {
    const slots = useSceneStages(() => false, () => new Group())
    const marker = {} as never
    slots.declarativeWorksStage.value = marker
    slots.declarativeWorksInstallation.value = marker
    slots.declarativeContactHalo.value = marker
    slots.declarativeManifestoInk.value = marker
    slots.declarativeContactTypography.value = marker
    slots.declarativeContactCyprus.value = marker
    slots.declarativeLabGamepad.value = marker
    slots.declarativeParticles.value = marker
    slots.declarativeCarousel.value = marker
    slots.declarativeShowreelTheater.value = marker

    slots.clear()

    expect([
      slots.declarativeWorksStage.value,
      slots.declarativeWorksInstallation.value,
      slots.declarativeContactHalo.value,
      slots.declarativeManifestoInk.value,
      slots.declarativeContactTypography.value,
      slots.declarativeContactCyprus.value,
      slots.declarativeLabGamepad.value,
      slots.declarativeParticles.value,
      slots.declarativeCarousel.value,
      slots.declarativeShowreelTheater.value,
    ]).toEqual(Array(10).fill(null))
  })
})
