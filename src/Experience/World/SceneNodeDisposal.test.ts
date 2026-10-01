import { dispose as disposeTresObject } from '@tresjs/core'
import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { DrawTrail } from './DrawTrail'
import { ParticleBurst, INTRO_TRACE_COUNT } from './ParticleBurst'

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

  it('leaves the active cursor ribbon resources to Tres and retires the displaced placeholder', () => {
    const placeholder = new THREE.BufferGeometry()
    placeholder.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3))
    const mesh = new THREE.Mesh(placeholder, new THREE.MeshBasicMaterial())
    const root = new THREE.Group()
    root.add(mesh)
    const trail = new DrawTrail({ root, ribbon: mesh })
    const geometry = mesh.geometry
    const material = mesh.material as THREE.Material
    const disposePlaceholder = vi.spyOn(placeholder, 'dispose')
    const disposeGeometry = vi.spyOn(geometry, 'dispose')
    const disposeMaterial = vi.spyOn(material, 'dispose')

    trail.dispose()
    expect(disposeGeometry).not.toHaveBeenCalled()
    expect(disposeMaterial).not.toHaveBeenCalled()
    placeholder.dispose()
    disposeTresObject(mesh)

    expect(disposePlaceholder).toHaveBeenCalledTimes(1)
    expect(disposeGeometry).toHaveBeenCalledTimes(1)
    expect(disposeMaterial).toHaveBeenCalledTimes(1)
  })
})
