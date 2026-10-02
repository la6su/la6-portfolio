import { Group, Mesh, Scene } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { WireframeTypography } from '../../../../src/Experience/World/WireframeTypography'

describe('WireframeTypography scene ownership', () => {
  it('animates declared glyph meshes and disposes resources without detaching them', () => {
    const typography = new WireframeTypography('HE', 0.34)
    const root = new Group()
    const scene = new Scene()
    const geometriesDisposed = typography.renderGlyphs.map(() => vi.fn())
    typography.renderGlyphs.forEach((glyph, index) => {
      glyph.geometry.addEventListener('dispose', geometriesDisposed[index]!)
      root.add(new Mesh(glyph.geometry, typography.material))
    })
    const materialDisposed = vi.fn()
    typography.material.addEventListener('dispose', materialDisposed)
    scene.add(root)

    expect(typography).not.toBeInstanceOf(Group)
    expect(root.children).toHaveLength(2)
    typography.bindMeshes(root.children as Mesh[])
    typography.setActive(true)
    typography.update(1.44)
    expect((root.children[0] as Mesh).scale.x).toBeGreaterThan(0)

    typography.dispose()
    expect(root.parent).toBe(scene)
    expect(root.children).toHaveLength(2)
    expect(geometriesDisposed.every((dispose) => dispose.mock.calls.length === 1)).toBe(true)
    expect(materialDisposed).toHaveBeenCalledTimes(1)
  })
})
