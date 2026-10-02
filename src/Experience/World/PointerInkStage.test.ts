import { Group, Mesh, Scene } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { ContactHaloStage } from './ContactHaloStage'

describe('PointerInkStage scene ownership', () => {
  it('binds its behavior mesh, exposes declarative visibility, and releases shared geometry', () => {
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
    first.bindMesh(mesh)
    first.setActive(true)
    expect(first.visible).toBe(true)

    first.dispose()
    expect(first.visible).toBe(false)
    expect(root.parent).toBe(scene)
    expect(geometryDisposed).not.toHaveBeenCalled()

    second.dispose()
    expect(geometryDisposed).toHaveBeenCalledTimes(1)
  })
})
