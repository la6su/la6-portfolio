import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { disposeSceneObjectResources } from '../Experience/Scene/SectionGroups'

describe('disposeSceneObjectResources', () => {
  it('disposes Points and InstancedMesh resources exactly once', () => {
    const root = new THREE.Group()
    const pointsGeometry = new THREE.BufferGeometry()
    const pointsMaterial = new THREE.PointsMaterial()
    const instancedGeometry = new THREE.BoxGeometry()
    const instancedMaterial = new THREE.MeshBasicMaterial()
    const points = new THREE.Points(pointsGeometry, pointsMaterial)
    const instanced = new THREE.InstancedMesh(instancedGeometry, instancedMaterial, 1)
    root.add(points, instanced)
    const pointsGeometryDispose = vi.spyOn(pointsGeometry, 'dispose')
    const pointsMaterialDispose = vi.spyOn(pointsMaterial, 'dispose')
    const instancedGeometryDispose = vi.spyOn(instancedGeometry, 'dispose')
    const instancedMaterialDispose = vi.spyOn(instancedMaterial, 'dispose')

    disposeSceneObjectResources(root)

    expect(pointsGeometryDispose).toHaveBeenCalledTimes(1)
    expect(pointsMaterialDispose).toHaveBeenCalledTimes(1)
    expect(instancedGeometryDispose).toHaveBeenCalledTimes(1)
    expect(instancedMaterialDispose).toHaveBeenCalledTimes(1)
  })
})
