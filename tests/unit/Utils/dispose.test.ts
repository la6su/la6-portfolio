import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Texture } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { disposeObject3DResources } from '../../../src/Utils/dispose'

describe('disposeObject3DResources', () => {
  it('disposes shared geometry, materials, and textures exactly once', () => {
    const root = new Group()
    const geometry = new BoxGeometry()
    const texture = new Texture()
    const material = new MeshBasicMaterial({ map: texture, alphaMap: texture })
    const geometryDispose = vi.spyOn(geometry, 'dispose')
    const materialDispose = vi.spyOn(material, 'dispose')
    const textureDispose = vi.spyOn(texture, 'dispose')

    root.add(new Mesh(geometry, material), new Mesh(geometry, material))

    disposeObject3DResources(root)

    expect(geometryDispose).toHaveBeenCalledTimes(1)
    expect(materialDispose).toHaveBeenCalledTimes(1)
    expect(textureDispose).toHaveBeenCalledTimes(1)
  })
})
