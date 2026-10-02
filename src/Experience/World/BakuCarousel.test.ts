import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { BakuCarousel } from './BakuCarousel'

describe('declarative Baku carousel owner', () => {
  it('keeps visibility state without mutating the Vue-owned root', () => {
    const carousel = new BakuCarousel()
    const root = new THREE.Group()

    expect(carousel).not.toBeInstanceOf(THREE.Object3D)
    carousel.bindRoot(root)
    carousel.visible = false
    expect(carousel.visible).toBe(false)
    expect(root.visible).toBe(true)

    carousel.dispose()
    expect(carousel.visible).toBe(false)
    expect(root.visible).toBe(true)
    expect(root.parent).toBeNull()
    carousel.unbindRoot(root)
  })
})
