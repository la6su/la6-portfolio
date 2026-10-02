import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { JunniParticles } from '../../../../src/Experience/World/JunniParticles'

describe('declarative Junni particle owner', () => {
  it('adopts a declared instanced mesh and keeps resource disposal singular', () => {
    const controller = new JunniParticles({ count: 3, texture: null })
    const parent = new THREE.Group()
    const mesh = new THREE.InstancedMesh(controller.geometry, controller.material, controller.count)
    parent.add(mesh)
    const firstGeometry = controller.geometry
    const firstGeometryDispose = vi.spyOn(firstGeometry, 'dispose')
    const materialDispose = vi.spyOn(controller.material, 'dispose')

    expect(controller).not.toBeInstanceOf(THREE.Object3D)
    controller.bindMesh(mesh)
    controller.visible = false
    expect(controller.visible).toBe(false)

    controller.setCount(2)
    expect(mesh.geometry).toBe(controller.geometry)
    expect(mesh.count).toBe(2)
    expect(firstGeometryDispose).toHaveBeenCalledTimes(1)

    controller.dispose()
    controller.dispose()
    expect(controller.visible).toBe(false)
    expect(mesh.parent).toBe(parent)
    expect(materialDispose).toHaveBeenCalledTimes(1)
    expect(firstGeometryDispose).toHaveBeenCalledTimes(1)
    controller.unbindMesh(mesh)
  })
})
