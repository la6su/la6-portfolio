import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { GroundPlane, type GroundConfig } from '../Experience/Scene/GroundPlane'

const config: GroundConfig = { color: new THREE.Color(0x123456), opacity: 0.5 }

function createGroundNode(): GroundPlane['object'] {
  return new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial())
}

describe('GroundPlane lifecycle', () => {
  it('skips unchanged material writes while preserving changed transforms and themes', () => {
    const ground = new GroundPlane(createGroundNode())
    const colorCopy = vi.spyOn(ground.object.material.color, 'copy')
    const lerpColors = vi.spyOn(THREE.Color.prototype, 'lerpColors')
    const next = { color: new THREE.Color(0xabcdef), opacity: 0.9 }

    try {
      ground.applyTransform(config, config, 0)
      const writesAfterFirstTransform = colorCopy.mock.calls.length
      lerpColors.mockClear()
      ground.applyTransform(config, config, 0)

      expect(colorCopy).toHaveBeenCalledTimes(writesAfterFirstTransform)
      expect(lerpColors).not.toHaveBeenCalled()
      ground.object.material.color.set(0xff0000)
      ground.object.material.opacity = 0.1
      ground.applyTransform(config, config, 0)
      expect(ground.object.material.color.getHex()).toBe(0x123456)
      expect(ground.object.material.opacity).toBe(0.5)

      ground.applyTransform(config, config, 0.5)
      expect(lerpColors).toHaveBeenCalledOnce()
      ground.applyTransform(config, next, 1)
      expect(ground.object.material.color.getHex()).toBe(0xabcdef)
      expect(ground.object.material.opacity).toBe(0.9)

      ground.syncTheme(true)
      expect(ground.object.material.color.getHex()).toBe(0x161616)
      expect(ground.object.material.opacity).toBe(0.4)
      const writesAfterTheme = colorCopy.mock.calls.length
      ground.applyTransform(config, next, 1)
      expect(colorCopy).toHaveBeenCalledTimes(writesAfterTheme)
    } finally {
      lerpColors.mockRestore()
      ground.dispose()
    }
  })

  it('ignores late theme, transform and visibility calls after teardown', () => {
    const node = createGroundNode()
    const ground = new GroundPlane(node)
    ground.setSectionVisible(true)
    const opacity = ground.object.material.opacity

    ground.dispose()
    ground.dispose()
    ground.applyInitialConfig(config)
    ground.syncTheme(true)
    ground.applyTransform(config, { color: new THREE.Color(0xabcdef), opacity: 0.9 }, 1)
    ground.setSectionVisible(false)

    expect(ground.object.material.opacity).toBe(opacity)
    expect(ground.object.visible).toBe(true)
    expect(ground.object).toBe(node)
  })

  it('leaves a declaratively-owned node attached for the Vue host to dispose', () => {
    const scene = new THREE.Scene()
    const node = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial())
    scene.add(node)
    const ground = new GroundPlane(node)

    ground.dispose()

    expect(node.parent).toBe(scene)
    expect(node.geometry.parameters.width).toBe(200)
  })
})
