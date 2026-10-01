import { Group, Mesh, Scene } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { ContactHaloStage } from './ContactHaloStage'

describe('PointerInkStage scene ownership', () => {
  it('adopts declarative nodes and releases its shared geometry after the final owner', () => {
    const first = new ContactHaloStage()
    const second = new ContactHaloStage()
    const root = new Group()
    const mesh = new Mesh(first.geometry, first.material)
    const scene = new Scene()
    const geometryDisposed = vi.fn()
    first.geometry.addEventListener('dispose', geometryDisposed)
    scene.add(root)
    root.add(mesh)

    expect(first).not.toBeInstanceOf(Group)
    expect(first.geometry).toBe(second.geometry)
    first.bindNodes(root, mesh)
    first.setActive(true)
    expect(root.visible).toBe(true)
    expect(mesh.position.toArray()).toEqual([-0.15, 0.3, -2.62])

    first.dispose()
    expect(root.visible).toBe(false)
    expect(root.parent).toBe(scene)
    expect(geometryDisposed).not.toHaveBeenCalled()

    second.dispose()
    expect(geometryDisposed).toHaveBeenCalledTimes(1)
  })
})
