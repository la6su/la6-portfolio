import { beforeAll, afterEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { installCanvasPointerShims, mountSceneCanvas } from './tresHarness'
import BakuCubeOwner from '../app/scene/BakuCubeOwner.vue'
import type { BakuCubeNodes } from '../Experience/World/SplashCube'

describe('BakuCubeOwner declarative Tres component', () => {
  beforeAll(() => {
    installCanvasPointerShims()
  })

  afterEach(() => document.body.replaceChildren())

  it('mounts the declarative baku subtree and releases it with the component', async () => {
    const mounted = { baku: null as BakuCubeNodes | null }
    const { scene, unmount } = await mountSceneCanvas(BakuCubeOwner, {
      onReady: (value: BakuCubeNodes) => {
        mounted.baku = value
      },
    })

    const baku = mounted.baku as BakuCubeNodes
    const root = scene.getObjectByName('baku')
    // The owner root is a Group — the old attribute-less root-mesh devtools
    // hack is gone with the imperative construction.
    expect(root).toBe(baku.root)
    expect(root).toBeInstanceOf(THREE.Group)
    expect(baku.root.children).toHaveLength(1)
    expect(baku.shell.name).toBe('baku-shell')
    expect(baku.shell.renderOrder).toBe(2)
    expect(baku.shell.material).toBeInstanceOf(THREE.MeshPhysicalMaterial)
    expect((baku.shell.material as THREE.MeshPhysicalMaterial).transmission).toBe(0.9)
    expect(baku.shell.geometry.getAttribute('position')).toBeTruthy()

    unmount()

    // Disposal is the Vue host's job: the declarative subtree leaves the
    // scene with the component (the controller never removes it).
    expect(scene.getObjectByName('baku')).toBeUndefined()
  })
})
