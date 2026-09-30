import { beforeAll, afterEach, describe, expect, it } from 'vitest'
import { installCanvasPointerShims, mountSceneCanvas } from './tresHarness'
import type { PerspectiveCamera } from 'three'
import CinematicCamera from '../app/scene/CinematicCamera.vue'

describe('CinematicCamera declarative Tres component', () => {
  beforeAll(() => {
    installCanvasPointerShims()
  })

  afterEach(() => document.body.replaceChildren())

  it('registers one active camera and removes it with the Tres subtree', async () => {
    const mounted = { camera: null as PerspectiveCamera | null }
    const { scene, context, unmount } = await mountSceneCanvas(CinematicCamera, {
      onReady: (camera: PerspectiveCamera) => {
        mounted.camera = camera
      },
    })

    const camera = mounted.camera as PerspectiveCamera
    expect(scene.getObjectByName('cinematic-camera')).toBe(camera)
    expect(camera.fov).toBe(75)
    expect(camera.near).toBe(0.1)
    expect(camera.far).toBe(1000)
    expect(context.camera.activeCamera.value?.uuid).toBe(camera.uuid)

    unmount()
    expect(scene.getObjectByName('cinematic-camera')).toBeUndefined()
  })
})
