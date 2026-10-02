import { Group, Scene } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { LabGamepad } from '../../../../src/Experience/World/LabGamepad'

describe('LabGamepad scene ownership', () => {
  it('animates adopted Vue nodes and leaves their attachment to Vue on disposal', () => {
    const stage = new LabGamepad()
    const root = new Group()
    const crank = new Group()
    const scene = new Scene()
    const geometryDisposed = vi.fn()
    const materialDisposed = vi.fn()
    stage.resources.geometry.body.addEventListener('dispose', geometryDisposed)
    stage.resources.material.shell.addEventListener('dispose', materialDisposed)
    scene.add(root)
    root.add(crank)

    stage.bindNodes(root, crank)
    expect(root.name).toBe('')
    expect(crank.name).toBe('')
    stage.setReducedMotion(false)
    stage.visible = true
    stage.update(1)
    expect(root.position.y).not.toBe(0)
    expect(crank.rotation.x).toBeCloseTo(-0.42)

    stage.resetMotion()
    expect(root.position.y).toBe(0)
    expect(root.rotation.toArray().slice(0, 3)).toEqual([-0.12, -0.24, 0.04])

    stage.dispose()
    stage.dispose()
    expect(stage.visible).toBe(false)
    expect(root.visible).toBe(true)
    expect(root.parent).toBe(scene)
    expect(geometryDisposed).toHaveBeenCalledTimes(1)
    expect(materialDisposed).toHaveBeenCalledTimes(1)
  })
})
