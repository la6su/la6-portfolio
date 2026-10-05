import * as THREE from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import { ServicesStage } from '../../../../src/Experience/World/ServicesStage'

describe('declarative services stage controller', () => {
  let stage: ServicesStage | null = null

  afterEach(() => {
    stage?.dispose()
    stage = null
  })

  it('drives the Vue-owned group and geometry nodes without owning their scene graph', () => {
    stage = new ServicesStage()
    const root = new THREE.Group()
    const parts = Array.from({ length: 5 }, () => new THREE.Mesh(new THREE.BoxGeometry()))
    const rings = Array.from({ length: 2 }, () => new THREE.Mesh(new THREE.TorusGeometry()))
    stage.adopt({ root, parts, rings })

    stage.visible = true
    expect(stage.visible).toBe(true)

    const camera = new THREE.PerspectiveCamera(75, 1.5)
    camera.position.set(1, 2, 3)
    camera.updateMatrixWorld(true)
    stage.updateState(camera, 0, 0.1, true)

    expect(root.position.x).toBeCloseTo(
      1 + 2 * Math.tan(THREE.MathUtils.degToRad(75 / 2)) * 5 * 1.5 * 0.22,
    )
    expect(root.position.y).toBeCloseTo(2)
    expect(root.position.z).toBeCloseTo(-2)
    expect(parts[0]?.position.x).toBeCloseTo(0)
    expect(rings[0]?.rotation.y).toBeCloseTo(0)
    expect(stage.isAnimating).toBe(false)
  })
})
