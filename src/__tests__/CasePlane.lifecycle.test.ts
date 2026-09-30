import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { CasePlane } from '../Experience/World/CasePlane'

describe('CasePlane lifecycle', () => {
  it('releases shared geometry after the final card and ignores late mutations', () => {
    const texture = new THREE.Texture()
    const plane = new CasePlane(texture)
    const second = new CasePlane(texture)
    const material = plane.material as THREE.Material
    const materialDispose = vi.spyOn(material, 'dispose')
    const sharedGeometry = plane.geometry
    const geometryDispose = vi.spyOn(sharedGeometry, 'dispose')

    plane.setReveal(0.4)
    plane.dispose()
    plane.dispose()
    plane.setReveal(1)
    plane.pulse()
    plane.update(1 / 60, true)

    expect(plane.isAnimating).toBe(false)
    expect(materialDispose).toHaveBeenCalledTimes(1)
    expect(geometryDispose).not.toHaveBeenCalled()
    second.dispose()
    expect(geometryDispose).toHaveBeenCalledOnce()
    expect(plane.texture).toBe(texture)
    texture.dispose()
  })
})
