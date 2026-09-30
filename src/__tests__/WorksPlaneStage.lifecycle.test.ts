import * as THREE from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loadCaseTexture: vi.fn(),
  releaseCaseTexture: vi.fn(),
}))
const motion = vi.hoisted(() => ({
  reduced: false,
  listener: null as ((reduced: boolean) => void) | null,
  unsubscribe: vi.fn(),
}))

vi.mock('../Experience/World/caseTexture', () => mocks)
vi.mock('../core/motionPolicy', () => ({
  prefersReducedMotion: () => motion.reduced,
  observeReducedMotion: (listener: (reduced: boolean) => void) => {
    motion.listener = listener
    return () => {
      motion.listener = null
      motion.unsubscribe()
    }
  },
}))

import { WorksPlaneStage } from '../Experience/World/WorksPlaneStage'

describe('WorksPlaneStage async lifecycle', () => {
  beforeEach(() => {
    mocks.loadCaseTexture.mockReset()
    mocks.releaseCaseTexture.mockReset()
    motion.reduced = false
    motion.listener = null
    motion.unsubscribe.mockReset()
  })

  it('releases pending textures without creating cards after dispose', async () => {
    const resolvers: Array<(texture: THREE.Texture) => void> = []
    mocks.loadCaseTexture.mockImplementation(
      () => new Promise<THREE.Texture>((resolve) => resolvers.push(resolve)),
    )

    const stage = new WorksPlaneStage()
    const initPromise = stage.init()
    expect(resolvers.length).toBeGreaterThan(0)

    stage.dispose()
    resolvers.forEach((resolve) => resolve(new THREE.Texture()))
    await initPromise

    expect(stage.children).toHaveLength(0)
    expect(mocks.releaseCaseTexture).toHaveBeenCalledTimes(resolvers.length)
    stage.dispose()
    expect(mocks.releaseCaseTexture).toHaveBeenCalledTimes(resolvers.length)
  })

  it('does not restart texture loading after disposal', async () => {
    const stage = new WorksPlaneStage()
    stage.dispose()

    await stage.init()

    expect(mocks.loadCaseTexture).not.toHaveBeenCalled()
    expect(stage.children).toHaveLength(0)
    expect(() => stage.dispose()).not.toThrow()
  })

  it('releases camera and active state on disposal', () => {
    const stage = new WorksPlaneStage()
    stage.setCamera(new THREE.PerspectiveCamera())
    stage.setActive(true, 0)

    stage.dispose()

    const internals = stage as unknown as {
      _camera: THREE.Camera | null
      _active: boolean
    }
    expect(internals._camera).toBeNull()
    expect(internals._active).toBe(false)
    expect(stage.children).toHaveLength(0)
  })

  it('releases each card texture with its acquired identity', async () => {
    const textures = Array.from({ length: 8 }, () => new THREE.Texture())
    let nextTexture = 0
    mocks.loadCaseTexture.mockImplementation(async () => textures[nextTexture++]!)

    const stage = new WorksPlaneStage()
    await stage.init()
    stage.dispose()

    expect(mocks.releaseCaseTexture).toHaveBeenCalled()
    for (const call of mocks.releaseCaseTexture.mock.calls) {
      expect(call[1]).toBeInstanceOf(THREE.Texture)
    }
  })

  it('snaps visible card reveals when reduced motion is active', async () => {
    mocks.loadCaseTexture.mockImplementation(async () => new THREE.Texture())
    motion.reduced = true
    const stage = new WorksPlaneStage()
    await stage.init()
    stage.setCamera(new THREE.PerspectiveCamera())
    stage.setActive(true, 0)

    stage.update(1 / 60)

    const reveal = (stage as unknown as { _reveal: Map<THREE.Object3D, number> })._reveal
    expect([...reveal.values()].filter((value) => value > 0)).toHaveLength(1)
    expect(stage.isAnimating).toBe(false)
    stage.dispose()
  })

  it('skips settled card rewrites but reconciles after camera movement', async () => {
    mocks.loadCaseTexture.mockImplementation(async () => new THREE.Texture())
    motion.reduced = true
    const stage = new WorksPlaneStage()
    await stage.init()
    const camera = new THREE.PerspectiveCamera()
    stage.setCamera(camera)
    stage.setActive(true, 0)

    const cards = (stage as unknown as { cards: THREE.Object3D[] }).cards
    const reveal = vi.spyOn(
      cards[0] as unknown as { setReveal: (value: number) => void },
      'setReveal',
    )
    stage.update(1 / 60)
    reveal.mockClear()
    stage.setActive(true, 0)
    stage.update(1 / 60)
    expect(reveal).not.toHaveBeenCalled()

    camera.position.x = 1
    stage.update(1 / 60)
    expect(reveal).toHaveBeenCalled()
    stage.dispose()
  })

  it('advances only the card with cloth activity while a sibling stays settled', async () => {
    mocks.loadCaseTexture.mockImplementation(async () => new THREE.Texture())
    const stage = new WorksPlaneStage()
    await stage.init()
    stage.setCamera(new THREE.PerspectiveCamera())
    stage.setActive(true, 0)

    const cards = (stage as unknown as { cards: Array<{ pulse: () => void }> }).cards
    for (let index = 0; index < 180 && stage.isAnimating; index += 1) {
      stage.update(1 / 60)
    }
    expect(stage.isAnimating).toBe(false)

    const siblingInternals = cards[1] as unknown as { _timeUni: { value: number } }
    const siblingTime = siblingInternals._timeUni.value
    const activeInternals = cards[0] as unknown as { _timeUni: { value: number } }
    const activeTime = activeInternals._timeUni.value
    expect((cards[1] as unknown as { isAnimating: boolean }).isAnimating).toBe(false)
    expect((stage as unknown as { _layoutDirty: boolean })._layoutDirty).toBe(false)

    cards[0]!.pulse()
    stage.update(1 / 60)

    expect(siblingInternals._timeUni.value).toBe(siblingTime)
    expect(activeInternals._timeUni.value).toBeGreaterThan(activeTime)
    stage.dispose()
  })

  it('does not dirty the settled layout when the same camera is handed off again', async () => {
    mocks.loadCaseTexture.mockImplementation(async () => new THREE.Texture())
    motion.reduced = true
    const stage = new WorksPlaneStage()
    await stage.init()
    const camera = new THREE.PerspectiveCamera()
    stage.setCamera(camera)
    stage.setActive(true, 0)
    stage.update(1 / 60)

    const cards = (stage as unknown as { cards: THREE.Object3D[] }).cards
    const reveal = vi.spyOn(
      cards[0] as unknown as { setReveal: (value: number) => void },
      'setReveal',
    )
    stage.setCamera(camera)
    stage.update(1 / 60)

    expect(reveal).not.toHaveBeenCalled()
    stage.dispose()
  })

  it('applies the live reduced-motion policy to the frame snapshot', () => {
    const stage = new WorksPlaneStage()
    const internals = stage as unknown as { _reducedMotion: boolean }

    expect(internals._reducedMotion).toBe(false)
    // Reduced-motion sync is owned by the Experience fan-out (one mechanism
    // for every scene owner) — no self-subscription to observeReducedMotion.
    stage.setReducedMotion(true)
    expect(internals._reducedMotion).toBe(true)

    stage.dispose()
  })

  it('settles active reveals and layout on a live reduced-motion change', async () => {
    mocks.loadCaseTexture.mockImplementation(async () => new THREE.Texture())
    const stage = new WorksPlaneStage()
    await stage.init()
    stage.setCamera(new THREE.PerspectiveCamera())
    stage.setActive(true, 0)
    stage.update(0.03)

    stage.setReducedMotion(true)

    const reveal = (stage as unknown as { _reveal: Map<THREE.Object3D, number> })._reveal
    expect([...reveal.values()].filter((value) => value > 0)).toHaveLength(1)
    expect([...reveal.values()].every((value) => value === 0 || value === 1)).toBe(true)
    expect(stage.isAnimating).toBe(false)
    stage.dispose()
  })

  it('reuses the scaled layout scratch object across viewport calculations', () => {
    const stage = new WorksPlaneStage()
    stage.setCamera(new THREE.PerspectiveCamera())
    const internals = stage as unknown as {
      layoutInView: (layout: { x: number; y: number; z: number; scale: number }) => unknown
    }
    const layout = { x: 0.1, y: 0.2, z: -3, scale: 0.5 }
    const first = internals.layoutInView(layout)
    const second = internals.layoutInView(layout)

    expect(second).toBe(first)
    stage.dispose()
  })

  it('ignores late public calls after terminal teardown', async () => {
    const stage = new WorksPlaneStage()
    stage.setCamera(new THREE.PerspectiveCamera())
    stage.setActive(true, 0)
    const overlay = vi.fn()

    stage.dispose()
    stage.dispose()
    stage.setCamera(new THREE.PerspectiveCamera())
    stage.resize(320, 640)
    stage.setActive(true, 1)
    expect(stage.openProject(0, overlay)).toBe(false)
    expect(stage.handleTap(20, 20, overlay)).toBe(false)
    expect(stage.hitTest(20, 20)).toBe(-1)
    stage.update(1 / 60)
    expect(overlay).not.toHaveBeenCalled()
    expect(stage.isAnimating).toBe(false)
  })
})
