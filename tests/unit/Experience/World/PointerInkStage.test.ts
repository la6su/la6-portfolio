import { Mesh, MeshBasicMaterial, PlaneGeometry } from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { describe, expect, it, vi } from 'vitest'
import { ContactHaloStage } from '../../../../src/Experience/World/ContactHaloStage'

/** The surface the Vue owner declares: plane geometry + node material. */
function createSurface(stage: ContactHaloStage) {
  const geometry = new PlaneGeometry(...stage.planeSize)
  const material = new MeshBasicNodeMaterial()
  const mesh = new Mesh(geometry, material)
  // The Vue owner declares the mesh at its hidden reveal scale.
  mesh.scale.setScalar(0.001)
  const geometryDisposed = vi.fn()
  const materialDisposed = vi.fn()
  geometry.addEventListener('dispose', geometryDisposed)
  material.addEventListener('dispose', materialDisposed)
  return { mesh, geometry, material, geometryDisposed, materialDisposed }
}

describe('PointerInkStage declarative surface contract', () => {
  it('feeds its authored ink into the color and opacity of the declared node material', () => {
    const stage = new ContactHaloStage()
    const { mesh, material } = createSurface(stage)

    stage.bindMesh(mesh)

    expect(material.colorNode).not.toBeNull()
    expect(material.opacityNode).not.toBeNull()
  })

  it('rejects a mesh whose declared material is not a node material', () => {
    const stage = new ContactHaloStage()
    const mesh = new Mesh(new PlaneGeometry(...stage.planeSize), new MeshBasicMaterial())

    expect(() => stage.bindMesh(mesh)).toThrow(/MeshBasicNodeMaterial/)
  })

  it('reveals through a damped mesh scale and re-enters from a clean state', () => {
    const stage = new ContactHaloStage()
    const { mesh } = createSurface(stage)
    stage.bindMesh(mesh)

    stage.setActive(true)
    expect(stage.visible).toBe(true)
    expect(mesh.scale.x).toBe(0.001)
    for (let frame = 0; frame < 60; frame += 1) stage.update(1 / 60)
    expect(mesh.scale.x).toBeGreaterThan(0.95)

    stage.setActive(false)
    expect(stage.visible).toBe(false)
    expect(mesh.scale.x).toBe(0.001)

    stage.setActive(true)
    expect(mesh.scale.x).toBe(0.001)
    stage.update(1 / 60)
    expect(mesh.scale.x).toBeGreaterThan(0.001)
  })

  it('settles the ink immediately under reduced motion instead of animating it', () => {
    const stage = new ContactHaloStage()
    const { mesh } = createSurface(stage)
    stage.setReducedMotion(true)
    stage.bindMesh(mesh)

    stage.setActive(true)
    expect(stage.isAnimating).toBe(false)
    expect(mesh.scale.x).toBe(1)

    stage.update(1 / 60)
    expect(mesh.scale.x).toBe(1)
  })

  it('leaves itself inert on dispose and never disposes the component-owned surface', () => {
    const stage = new ContactHaloStage()
    const { mesh, geometryDisposed, materialDisposed } = createSurface(stage)
    stage.bindMesh(mesh)
    stage.setActive(true)
    for (let frame = 0; frame < 10; frame += 1) stage.update(1 / 60)
    const revealedScale = mesh.scale.x

    stage.dispose()

    expect(stage.visible).toBe(false)
    expect(stage.isAnimating).toBe(false)
    stage.update(1 / 60)
    expect(mesh.scale.x).toBe(revealedScale)

    const laterMesh = new Mesh(new PlaneGeometry(...stage.planeSize), new MeshBasicNodeMaterial())
    stage.bindMesh(laterMesh)
    stage.setActive(true)
    expect(stage.visible).toBe(false)
    expect(laterMesh.material.colorNode).toBeNull()
    expect(laterMesh.scale.x).toBe(1)

    expect(geometryDisposed).not.toHaveBeenCalled()
    expect(materialDisposed).not.toHaveBeenCalled()
  })
})
