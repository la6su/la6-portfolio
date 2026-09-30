import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { installCanvasPointerShims, mountSceneCanvas } from './tresHarness'
import * as THREE from 'three'
import ServicesStageOwner from '../app/scene/ServicesStageOwner.vue'
import type { ServicesStage } from '../Experience/World/ServicesStage'

describe('ServicesStageOwner lifecycle spike', () => {
  beforeAll(() => {
    installCanvasPointerShims()
  })
  afterEach(() => document.body.replaceChildren())

  it('attaches the imperative owner once and disposes it with Vue teardown', async () => {
    const mounted = { stage: null as ServicesStage | null }
    const { scene, unmount } = await mountSceneCanvas(ServicesStageOwner, {
      onReady: (value: ServicesStage) => (mounted.stage = value),
    })

    const stage = mounted.stage
    expect(stage?.parent).toBe(scene)
    expect(stage?.getObjectByName('services-orbit-0')).toBeTruthy()
    expect(stage?.getObjectByName('services-orbit-1')).toBeTruthy()
    expect(stage?.getObjectByName('services-orbit-2')).toBeTruthy()
    const camera = new THREE.PerspectiveCamera()
    camera.aspect = 1.5
    const offset = (stage as unknown as { offset: THREE.Vector3 }).offset
    stage?.updateState(camera, 0, 1 / 60, false)
    stage?.updateState(camera, 1, 1 / 60, false)
    expect((stage as unknown as { offset: THREE.Vector3 }).offset).toBe(offset)
    const dispose = vi.spyOn(stage as ServicesStage, 'dispose')
    unmount()
    expect(dispose).toHaveBeenCalledOnce()
    expect(stage?.parent).toBeNull()
  })
})
