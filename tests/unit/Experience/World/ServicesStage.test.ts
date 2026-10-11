import * as THREE from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import { ServicesStage } from '../../../../src/Experience/World/ServicesStage'

describe('declarative services stage controller', () => {
  let stage: ServicesStage | null = null

  afterEach(() => {
    stage?.dispose()
    stage = null
  })

  it('poses one Vue-owned sculpture without owning its scene graph', () => {
    stage = new ServicesStage()
    const root = new THREE.Group()
    const sculpture = new THREE.Group()
    stage.adopt({ root, sculpture })

    stage.visible = true
    expect(stage.visible).toBe(true)

    const camera = new THREE.PerspectiveCamera(75, 1.5)
    camera.position.set(1, 2, 3)
    camera.updateMatrixWorld(true)
    stage.updateState(camera, 0, 0.1, true)

    expect(root.position.x).toBeCloseTo(
      1 + 2 * Math.tan(THREE.MathUtils.degToRad(75 / 2)) * 5 * 1.5 * 0.22,
    )
    expect(root.position.y).toBeCloseTo(
      2 + 2 * Math.tan(THREE.MathUtils.degToRad(75 / 2)) * 5 * 0.1,
    )
    expect(root.position.z).toBeCloseTo(-2)
    expect(stage.ribbonGeometry.getAttribute('position').count).toBeGreaterThan(1000)
    expect(stage.isAnimating).toBe(false)
  })
})
