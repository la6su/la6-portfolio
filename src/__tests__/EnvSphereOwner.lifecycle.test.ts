import { defineComponent, h, shallowRef } from 'vue'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { installCanvasPointerShims, mountSceneCanvas } from './tresHarness'
import type { Mesh } from 'three'
import EnvSky from '../app/scene/EnvSky.vue'
import EnvSphereOwner from '../app/scene/EnvSphereOwner.vue'
import type { EnvSphere } from '../Experience/World/EnvSphere'

describe('EnvSphereOwner declarative sky lifecycle', () => {
  beforeAll(() => {
    installCanvasPointerShims()
  })

  afterEach(() => document.body.replaceChildren())

  it('gives Tres the sky geometry while EnvSphere disposes its borrowed material once', async () => {
    const mounted = {
      sphere: null as EnvSphere | null,
      sky: null as Mesh | null,
    }
    const Harness = defineComponent({
      setup() {
        const sphere = shallowRef<EnvSphere | null>(null)
        return () => [
          h(EnvSphereOwner, {
            onReady: (owner: EnvSphere) => {
              sphere.value = owner
              mounted.sphere = owner
            },
          }),
          sphere.value
            ? h(EnvSky, {
                material: sphere.value.skyMaterial,
                onReady: (sky: Mesh) => (mounted.sky = sky),
              })
            : null,
        ]
      },
    })

    const { scene, unmount } = await mountSceneCanvas(Harness)

    const sphere = mounted.sphere as EnvSphere
    const sky = mounted.sky as Mesh
    const disposeMaterial = vi.spyOn(sphere.skyMaterial, 'dispose')
    const disposeGeometry = vi.spyOn(sky.geometry, 'dispose')

    expect(sphere.getObjectByName('pavilion-sky')).toBeUndefined()
    expect(scene.getObjectByName('pavilion-sky')).toBe(sky)
    expect(sky.material).toBe(sphere.skyMaterial)

    unmount()

    expect(disposeGeometry).toHaveBeenCalledOnce()
    expect(disposeMaterial).toHaveBeenCalledOnce()
    expect(scene.getObjectByName('pavilion-sky')).toBeUndefined()
    expect(sphere.parent).toBeNull()
  })
})
