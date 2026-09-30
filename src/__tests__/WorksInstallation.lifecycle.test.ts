import { describe, expect, it } from 'vitest'
import { WorksInstallation } from '../Experience/World/WorksInstallation'
import * as THREE from 'three'

describe('WorksInstallation project direction', () => {
  it('switches the authored assembly for the selected project', () => {
    const installation = new WorksInstallation()
    const assembly = new THREE.Group()
    const material = new THREE.MeshBasicMaterial()
    const arcs = Array.from(
      { length: 3 },
      () => new THREE.Mesh(new THREE.TorusGeometry(), material),
    )
    const trace = new THREE.Mesh(new THREE.TorusGeometry(), material)
    const ticks = new THREE.InstancedMesh(new THREE.BoxGeometry(), material, 48)
    arcs.forEach((arc) => assembly.add(arc))
    assembly.add(trace, ticks)
    const retiredNodes = { assembly: new THREE.Group(), arcs: [], trace, ticks }
    installation.adopt(retiredNodes)
    const nodes = { assembly, arcs, trace, ticks }
    installation.adopt(nodes)
    installation.release(retiredNodes)
    installation.setCameraLocalLayout(1, 2, 3, 1)
    expect(assembly.position.toArray()).toEqual([1, 2, 3])
    installation.setProject(0)
    expect(ticks.visible).toBe(true)

    installation.setProject(1)
    expect(ticks.visible).toBe(false)
    expect(trace.scale.x).toBe(1)

    installation.setProject(2)
    expect(trace.scale.x).toBeCloseTo(1.16)
    installation.dispose()
    arcs.forEach((arc) => arc.geometry.dispose())
    trace.geometry.dispose()
    ticks.geometry.dispose()
    ticks.dispose()
    material.dispose()
  })
})
