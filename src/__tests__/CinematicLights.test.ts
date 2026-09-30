import { beforeAll, afterEach, describe, expect, it } from 'vitest'
import { installCanvasPointerShims, mountSceneCanvas } from './tresHarness'
import CinematicLights from '../app/scene/CinematicLights.vue'
import type { CinematicLightsNodes } from '../Experience/World/Lights'

describe('CinematicLights declarative Tres component', () => {
  beforeAll(() => {
    installCanvasPointerShims()
  })

  afterEach(() => document.body.replaceChildren())

  it('mounts one complete declarative light subtree and releases it with the component', async () => {
    const mounted = { lights: null as CinematicLightsNodes | null }
    const { scene, unmount } = await mountSceneCanvas(CinematicLights, {
      onReady: (value: CinematicLightsNodes) => {
        mounted.lights = value
      },
    })

    const lights = mounted.lights as CinematicLightsNodes
    expect(scene.getObjectByName('cinematic-lights')).toBe(lights.group)
    expect(lights.group.children).toHaveLength(5)
    expect(lights.key.parent).toBe(lights.group)
    expect(lights.hemisphere.intensity).toBe(0.2)

    unmount()

    // Disposal is the Vue host's job: the declarative subtree leaves the
    // scene with the component (the Lights controller never removes it).
    expect(scene.getObjectByName('cinematic-lights')).toBeUndefined()
  })
})
