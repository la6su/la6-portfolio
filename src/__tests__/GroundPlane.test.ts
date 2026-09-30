import { beforeAll, afterEach, describe, expect, it } from 'vitest'
import { installCanvasPointerShims, mountSceneCanvas } from './tresHarness'
import GroundPlane from '../app/scene/GroundPlane.vue'
import type { GroundPlaneNode } from '../Experience/Scene/GroundPlane'

describe('GroundPlane declarative Tres component', () => {
  beforeAll(() => {
    installCanvasPointerShims()
  })

  afterEach(() => document.body.replaceChildren())

  it('mounts and removes the exclusive ground node with the Tres subtree', async () => {
    const mounted = { ground: null as GroundPlaneNode | null }
    const { scene, unmount } = await mountSceneCanvas(GroundPlane, {
      onReady: (node: GroundPlaneNode) => (mounted.ground = node),
    })

    const ground = mounted.ground as GroundPlaneNode
    expect(scene.getObjectByName('ground')).toBe(ground)
    expect(ground.geometry.parameters.width).toBe(200)
    expect(ground.material.depthWrite).toBe(false)

    unmount()
    expect(scene.getObjectByName('ground')).toBeUndefined()
  })
})
