import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Scene, Texture } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { ContactCyprusStage } from '../../../../src/Experience/World/ContactCyprusStage'

const { loadGltf, disposeDraco } = vi.hoisted(() => ({
  loadGltf: vi.fn(),
  disposeDraco: vi.fn(),
}))

vi.mock('three/addons/loaders/DRACOLoader.js', () => ({
  DRACO_GLTF_CONFIG: {},
  DRACOLoader: class {
    setDecoderPath() {}
    dispose() {
      disposeDraco()
    }
  },
}))

vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    setDRACOLoader() {
      return this
    }
    loadAsync(url: string) {
      return loadGltf(url)
    }
  },
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

describe('ContactCyprusStage asset lifecycle', () => {
  it('disposes a late GLTF result after the route stage was retired', async () => {
    const pending = deferred<{ scene: Group }>()
    const model = new Group()
    const geometry = new BoxGeometry()
    const texture = new Texture()
    const material = new MeshBasicMaterial({ map: texture })
    model.add(new Mesh(geometry, material))
    const disposeGeometry = vi.spyOn(geometry, 'dispose')
    const disposeMaterial = vi.spyOn(material, 'dispose')
    const disposeTexture = vi.spyOn(texture, 'dispose')
    const stage = new ContactCyprusStage()
    const published: unknown[] = []
    stage.bindRoot(new Group(), (next) => {
      published.push(next)
    })
    loadGltf.mockReset().mockReturnValueOnce(pending.promise)
    disposeDraco.mockClear()

    const loading = stage.load()
    stage.dispose()
    pending.resolve({ scene: model })
    await loading

    expect(loadGltf).toHaveBeenCalledWith('/assets/gltf/cyprus_3d.glb')
    expect(disposeDraco).toHaveBeenCalledTimes(1)
    expect(disposeGeometry).toHaveBeenCalledTimes(1)
    expect(disposeMaterial).toHaveBeenCalledTimes(1)
    expect(disposeTexture).toHaveBeenCalledTimes(1)
    expect(published).toEqual([null])
  })

  it('releases the Draco decoder when the GLTF request fails', async () => {
    const stage = new ContactCyprusStage()
    const failure = new Error('GLTF request failed')
    loadGltf.mockReset().mockRejectedValueOnce(failure)
    disposeDraco.mockClear()

    await expect(stage.load()).rejects.toBe(failure)

    expect(disposeDraco).toHaveBeenCalledTimes(1)
    stage.dispose()
  })
})

describe('ContactCyprusStage scene ownership', () => {
  it('adopts a Vue-owned root and leaves its attachment to Vue on disposal', () => {
    const stage = new ContactCyprusStage()
    const root = new Group()
    const scene = new Scene()
    const published: unknown[] = []
    scene.add(root)

    expect(stage).not.toBeInstanceOf(Group)
    stage.bindRoot(root, (model) => {
      published.push(model)
    })
    expect(root.name).toBe('contact-cyprus-stage')
    expect(stage.visible).toBe(false)

    stage.setActive(true)
    expect(stage.visible).toBe(true)
    stage.setReducedMotion(true)
    stage.setActive(false)
    expect(stage.visible).toBe(false)

    stage.resize(1600, 900)
    expect(root.scale.x).toBeCloseTo(1600 / 900 / 1.78)

    stage.dispose()
    expect(stage.visible).toBe(false)
    expect(root.parent).toBe(scene)
    expect(published).toEqual([null])
  })
})
