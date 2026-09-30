import { beforeAll, afterEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { installCanvasPointerShims, mountSceneCanvas } from './tresHarness'
import IntroLightFramesOwner from '../app/scene/IntroLightFramesOwner.vue'
import { INTRO_TRACE_COUNT, type IntroLightFramesNodes } from '../Experience/World/ParticleBurst'

describe('IntroLightFramesOwner declarative Tres component', () => {
  beforeAll(() => {
    installCanvasPointerShims()
  })

  afterEach(() => document.body.replaceChildren())

  it('mounts the declarative instanced leaf and releases it with the component', async () => {
    const mounted = { frames: null as IntroLightFramesNodes | null }
    const { scene, unmount } = await mountSceneCanvas(IntroLightFramesOwner, {
      onReady: (value: IntroLightFramesNodes) => {
        mounted.frames = value
      },
    })

    const frames = mounted.frames as IntroLightFramesNodes
    const mesh = scene.getObjectByName('intro-light-frames')
    expect(mesh).toBe(frames.mesh)
    expect(mesh).toBeInstanceOf(THREE.InstancedMesh)
    // The rest state is hidden; the trace material is behavior-assigned by
    // the controller after Experience adopts the node.
    expect(frames.mesh.count).toBe(INTRO_TRACE_COUNT)
    expect(frames.mesh.visible).toBe(false)
    expect(frames.mesh.frustumCulled).toBe(false)
    expect(frames.mesh.geometry.getAttribute('position')).toBeTruthy()

    unmount()

    expect(scene.getObjectByName('intro-light-frames')).toBeUndefined()
  })
})
