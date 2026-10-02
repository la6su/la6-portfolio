import { Group, Mesh, Texture } from 'three'
import { describe, expect, it } from 'vitest'
import {
  acquireCasePlaneGeometry,
  CasePlane,
  createCasePlaneMaterialResources,
} from '../../../../src/Experience/World/CasePlane'

describe('CasePlane geometry leases', () => {
  it('shares geometry until the last idempotent lease is released', () => {
    const first = acquireCasePlaneGeometry()
    const second = acquireCasePlaneGeometry()
    let disposed = 0
    first.geometry.addEventListener('dispose', () => disposed++)

    expect(second.geometry).toBe(first.geometry)
    first.release()
    first.release()
    expect(disposed).toBe(0)

    second.release()
    second.release()
    expect(disposed).toBe(1)
  })

  it('drives an adopted mesh and leaves scene detachment to its Vue owner', () => {
    const texture = new Texture()
    const lease = acquireCasePlaneGeometry()
    const resources = createCasePlaneMaterialResources(texture)
    const mesh = new Mesh(lease.geometry, resources.material)
    const root = new Group()
    root.add(mesh)
    const plane = new CasePlane(mesh, texture, resources, lease)

    plane.setReveal(0.5)
    expect(mesh.visible).toBe(true)
    plane.dispose(false)

    expect(mesh.parent).toBe(root)
    expect(plane.texture).toBeNull()
  })
})
