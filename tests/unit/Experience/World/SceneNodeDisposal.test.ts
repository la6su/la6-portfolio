import { dispose as disposeTresObject } from '@tresjs/core'
import * as THREE from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { describe, expect, it, vi } from 'vitest'
import { DrawTrail } from '../../../../src/Experience/World/DrawTrail'
import { ParticleBurst, INTRO_TRACE_COUNT } from '../../../../src/Experience/World/ParticleBurst'

describe('Tres-declared boot node disposal', () => {
  it('leaves the intro burst resources to the mounted Tres node', () => {
    const geometry = new THREE.PlaneGeometry(1, 1)
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial(), INTRO_TRACE_COUNT)
    const root = new THREE.Group()
    root.add(mesh)
    const burst = new ParticleBurst({ mesh })
    const material = mesh.material as THREE.Material
    const disposeGeometry = vi.spyOn(geometry, 'dispose')
    const disposeMaterial = vi.spyOn(material, 'dispose')

    burst.dispose()
    expect(disposeGeometry).not.toHaveBeenCalled()
    expect(disposeMaterial).not.toHaveBeenCalled()

    disposeTresObject(mesh)
    expect(disposeGeometry).toHaveBeenCalledTimes(1)
    expect(disposeMaterial).toHaveBeenCalledTimes(1)
  })

  it('fills the declared cursor ribbon container and leaves it to Tres', () => {
    const geometry = new THREE.PlaneGeometry(1, 1, 35, 1)
    const material = new MeshBasicNodeMaterial()
    const mesh = new THREE.Mesh(geometry, material)
    const root = new THREE.Group()
    root.add(mesh)
    const trail = new DrawTrail({ root, ribbon: mesh })
    trail.setVisible(true)
    expect(root.visible).toBe(true)
    trail.setVisible(false)
    expect(root.visible).toBe(false)
    // The controller writes the pointer buffers into the declared container
    // instead of replacing the geometry or the material.
    expect(mesh.geometry).toBe(geometry)
    expect(mesh.material).toBe(material)
    expect(geometry.attributes.position?.count).toBe(72)
    expect(geometry.attributes.uv?.count).toBe(72)
    expect(geometry.index?.count).toBe(210)
    expect(material.colorNode).not.toBeNull()
    expect(material.opacityNode).not.toBeNull()

    const disposeGeometry = vi.spyOn(geometry, 'dispose')
    const disposeMaterial = vi.spyOn(material, 'dispose')

    trail.dispose()
    expect(disposeGeometry).not.toHaveBeenCalled()
    expect(disposeMaterial).not.toHaveBeenCalled()

    disposeTresObject(mesh)
    expect(disposeGeometry).toHaveBeenCalledTimes(1)
    expect(disposeMaterial).toHaveBeenCalledTimes(1)
  })
})
