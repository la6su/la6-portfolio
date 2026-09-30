import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loadAsync: vi.fn(),
  dracoDispose: vi.fn(),
}))

vi.mock('three/addons/loaders/DRACOLoader.js', () => ({
  DRACOLoader: class {
    setDecoderPath(): this {
      return this
    }

    dispose(): void {
      mocks.dracoDispose()
    }
  },
  DRACO_GLTF_CONFIG: '/mock-draco/',
}))

vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    setDRACOLoader(): this {
      return this
    }

    loadAsync(...args: unknown[]): Promise<{ scene: THREE.Group }> {
      return mocks.loadAsync(...args)
    }
  },
}))

import { ContactCyprusStage } from '../Experience/World/ContactCyprusStage'

describe('ContactCyprusStage async lifecycle', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('skips repeated presentation writes while applying changed fade state', () => {
    const stage = new ContactCyprusStage()
    const model = new THREE.Group()
    const material = new THREE.MeshPhysicalMaterial({ transparent: true })
    model.add(new THREE.Mesh(new THREE.BufferGeometry(), material))
    stage.add(model)
    const internals = stage as unknown as {
      _model: THREE.Group | null
      _materials: THREE.MeshPhysicalMaterial[]
      _opacity: number
      _scale: number
      _appliedOpacity: number
      _appliedScale: number
      setPresentation: (opacity: number, scale: number) => void
    }
    internals._model = model
    internals._materials = [material]
    internals._opacity = 0.4
    internals._scale = 1
    internals._appliedOpacity = 0.4
    internals._appliedScale = 1
    material.opacity = 0.4
    const setScalar = vi.spyOn(model.scale, 'setScalar')

    internals.setPresentation(0.4, 1)
    expect(setScalar).not.toHaveBeenCalled()
    expect(material.opacity).toBe(0.4)

    internals.setPresentation(0.8, 1.2)
    expect(setScalar).toHaveBeenCalledWith(1.2)
    expect(material.opacity).toBe(0.8)
    stage.dispose()
  })

  it('settles an active fade and scale synchronously on reduced motion', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    const stage = new ContactCyprusStage()
    const model = new THREE.Group()
    const material = new THREE.MeshPhysicalMaterial({ transparent: true })
    model.add(new THREE.Mesh(new THREE.BufferGeometry(), material))
    stage.add(model)
    const internals = stage as unknown as {
      _model: THREE.Group | null
      _materials: THREE.MeshPhysicalMaterial[]
    }
    internals._model = model
    internals._materials = [material]

    stage.setActive(true)
    stage.update(0.1)
    expect(stage.isAnimating).toBe(true)
    expect(material.opacity).toBeLessThan(1)

    stage.setReducedMotion(true)

    expect(stage.isAnimating).toBe(false)
    expect(material.opacity).toBe(1)
    expect(model.scale.x).toBe(1)
    stage.dispose()
  })

  it('skips settled camera pose writes until the camera actually moves', () => {
    const stage = new ContactCyprusStage()
    const model = new THREE.Group()
    model.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshPhysicalMaterial()))
    stage.add(model)
    const internals = stage as unknown as {
      _model: THREE.Group | null
      _materials: THREE.MeshPhysicalMaterial[]
    }
    internals._model = model
    internals._materials = [
      (model.children[0] as THREE.Mesh).material as THREE.MeshPhysicalMaterial,
    ]

    const camera = new THREE.PerspectiveCamera()
    stage.setCamera(camera)
    stage.setReducedMotion(true)
    stage.setActive(true)
    const positionCopy = vi.spyOn(stage.position, 'copy')
    const quaternionCopy = vi.spyOn(stage.quaternion, 'copy')

    stage.update(1 / 60)
    positionCopy.mockClear()
    quaternionCopy.mockClear()
    stage.update(1 / 60)
    expect(positionCopy).not.toHaveBeenCalled()
    expect(quaternionCopy).not.toHaveBeenCalled()

    camera.position.x = 1
    stage.update(1 / 60)
    expect(positionCopy).toHaveBeenCalled()
    expect(quaternionCopy).toHaveBeenCalled()
    stage.dispose()
  })

  it('hides an inactive target synchronously on reduced motion', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    const stage = new ContactCyprusStage()
    const model = new THREE.Group()
    const material = new THREE.MeshPhysicalMaterial({ transparent: true })
    model.add(new THREE.Mesh(new THREE.BufferGeometry(), material))
    stage.add(model)
    const internals = stage as unknown as {
      _model: THREE.Group | null
      _materials: THREE.MeshPhysicalMaterial[]
    }
    internals._model = model
    internals._materials = [material]

    stage.setActive(false)
    stage.setReducedMotion(true)

    expect(stage.visible).toBe(false)
    expect(material.opacity).toBe(0)
    expect(stage.isAnimating).toBe(false)
    stage.dispose()
  })

  it('does not attach a GLTF result after disposal wins the pending load', async () => {
    mocks.loadAsync.mockReset()
    mocks.dracoDispose.mockReset()
    let resolveLoad!: (result: { scene: THREE.Group }) => void
    mocks.loadAsync.mockImplementation(
      () =>
        new Promise<{ scene: THREE.Group }>((resolve) => {
          resolveLoad = resolve
        }),
    )

    const stage = new ContactCyprusStage()
    const loading = stage.load()
    stage.dispose()
    resolveLoad({ scene: new THREE.Group() })
    await loading

    expect(stage.children).toHaveLength(0)
    expect(mocks.dracoDispose).toHaveBeenCalledTimes(1)
    stage.dispose()
    expect(stage.children).toHaveLength(0)
  })

  it('releases camera, active state and child graph on disposal', () => {
    const stage = new ContactCyprusStage()
    stage.setCamera(new THREE.PerspectiveCamera())
    stage.setActive(true)
    const model = new THREE.Group()
    model.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial()))
    const internals = stage as unknown as {
      _model: THREE.Object3D | null
      _camera: THREE.Camera | null
      _active: boolean
    }
    internals._model = model
    stage.add(model)

    stage.dispose()

    expect(stage.children).toHaveLength(0)
    expect(internals._model).toBeNull()
    expect(internals._camera).toBeNull()
    expect(internals._active).toBe(false)
    expect(stage.isActive).toBe(false)
  })

  it('ignores late public calls after terminal teardown', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    const stage = new ContactCyprusStage()
    stage.dispose()
    stage.dispose()
    stage.setCamera(new THREE.PerspectiveCamera())
    stage.setActive(true)
    stage.setReducedMotion(true)
    stage.prewarm()
    stage.resize(320, 640)
    stage.update(1 / 60)
    await stage.load()

    expect(stage.isActive).toBe(false)
    expect(stage.isAnimating).toBe(false)
    expect(stage.children).toHaveLength(0)
  })
})
