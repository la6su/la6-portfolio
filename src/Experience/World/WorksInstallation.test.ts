import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { WorksInstallation } from './WorksInstallation'

describe('declarative Works installation controller', () => {
  it('adopts Vue nodes, applies project/room state, and disposes its materials once', () => {
    const installation = new WorksInstallation()
    const assembly = new THREE.Group()
    const arcs = Array.from({ length: 3 }, () => new THREE.Mesh())
    const trace = new THREE.Mesh()
    const ticks = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 48)
    const nodes = { assembly, arcs, trace, ticks }
    const disposeMetal = vi.spyOn(installation.metalMaterial, 'dispose')
    const disposeSignal = vi.spyOn(installation.signalMaterial, 'dispose')

    installation.setProject(2)
    installation.setRoom(3, false)
    installation.adopt(nodes)
    expect(ticks.visible).toBe(true)
    expect(assembly.rotation.z).toBeCloseTo(0.35)
    expect(trace.position.y).toBe(0)
    expect(arcs[0]!.scale.x).toBeCloseTo(1.05)

    installation.setCameraLocalLayout(1, 2, -5.6, 0.4)
    expect(assembly.position.toArray()).toEqual([1, 2, -5.6])
    expect(assembly.scale.toArray()).toEqual([0.4, 0.4, 0.4])

    installation.setInverse(true)
    expect(installation.metalMaterial.color.getHex()).toBe(0x38444b)
    installation.dispose()
    installation.dispose()
    expect(disposeMetal).toHaveBeenCalledTimes(1)
    expect(disposeSignal).toHaveBeenCalledTimes(1)
  })

  it('releases mounted node refs without disposing the controller material', () => {
    const installation = new WorksInstallation()
    const nodes = {
      assembly: new THREE.Group(),
      arcs: [new THREE.Mesh(), new THREE.Mesh(), new THREE.Mesh()],
      trace: new THREE.Mesh(),
      ticks: new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 48),
    }
    const disposeSignal = vi.spyOn(installation.signalMaterial, 'dispose')

    installation.adopt(nodes)
    installation.release(nodes)
    installation.setCameraLocalLayout(3, 4, -5.6, 0.5)
    expect(nodes.assembly.position.toArray()).toEqual([0, 0, 0])
    expect(disposeSignal).not.toHaveBeenCalled()
    installation.dispose()
    expect(disposeSignal).toHaveBeenCalledTimes(1)
  })
})
