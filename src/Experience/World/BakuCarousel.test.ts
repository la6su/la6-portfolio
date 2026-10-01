import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { BakuCarousel } from './BakuCarousel'

describe('declarative Baku carousel owner', () => {
  it('adopts the Vue-owned root and mirrors visibility without owning the scene node', () => {
    const carousel = new BakuCarousel()
    const root = new THREE.Group()

    expect(carousel).not.toBeInstanceOf(THREE.Object3D)
    carousel.bindRoot(root)
    carousel.visible = false
    expect(root.name).toBe('baku-carousel')
    expect(root.visible).toBe(false)

    carousel.dispose()
    expect(root.visible).toBe(false)
    expect(root.parent).toBeNull()
    carousel.unbindRoot(root)
  })
})
