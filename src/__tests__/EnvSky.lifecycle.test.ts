import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { installCanvasPointerShims, mountSceneCanvas } from './tresHarness'
import * as THREE from 'three'
import EnvSky from '../app/scene/EnvSky.vue'

describe('EnvSky declarative lifecycle spike', () => {
  beforeAll(() => {
    installCanvasPointerShims()
  })
  afterEach(() => document.body.replaceChildren())

  it('owns the plane geometry while borrowing the ambient material', async () => {
    const material = new THREE.MeshBasicMaterial()
    const mounted = { mesh: null as THREE.Mesh | null }
    const { scene, unmount } = await mountSceneCanvas(EnvSky, {
      material,
      onReady: (mesh: THREE.Mesh) => (mounted.mesh = mesh),
    })

    expect(mounted.mesh?.parent).toBe(scene)
    expect(mounted.mesh?.geometry).toBeInstanceOf(THREE.PlaneGeometry)
    expect(mounted.mesh?.material).toBe(material)
    const dispose = vi.spyOn(material, 'dispose')
    unmount()
    expect(dispose).not.toHaveBeenCalled()
    expect(material.dispose).not.toHaveBeenCalled()
    material.dispose()
  })
})
