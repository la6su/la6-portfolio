import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { Camera } from '../Experience/Camera'
import { Sizes } from '../Experience/Sizes'
import { isLabCameraActive, setLabCameraActive } from '../core/labCameraPolicy'

describe('Camera Lab-controls yield (ADR 0005)', () => {
  afterEach(() => {
    setLabCameraActive(false)
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('freezes the cinematic writer while the Lab controls own the pose', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    vi.spyOn(THREE.PerspectiveCamera.prototype, 'lookAt').mockImplementation(() => undefined)
    const sizes = new Sizes()
    const instance = new THREE.PerspectiveCamera()
    const camera = new Camera(sizes, instance)
    const authored = instance.position.clone()

    setLabCameraActive(true)
    // The controls move the camera (user orbit)…
    instance.position.set(2, 1, 3)
    camera.update(0.05)
    camera.update(0.05)

    // …and the writer never fights back while it yields.
    expect(instance.position.x).toBeCloseTo(2)
    expect(instance.position.y).toBeCloseTo(1)
    expect(instance.position.z).toBeCloseTo(3)
    expect(authored.x).not.toBeCloseTo(2)
    camera.destroy()
    sizes.destroy()
  })

  it('hands back from the orbit pose without snapping to the authored framing', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    vi.spyOn(THREE.PerspectiveCamera.prototype, 'lookAt').mockImplementation(() => undefined)
    const sizes = new Sizes()
    const instance = new THREE.PerspectiveCamera()
    const camera = new Camera(sizes, instance)

    setLabCameraActive(true)
    instance.position.set(2, 1, 3)
    camera.update(0.05)
    setLabCameraActive(false)

    camera.update(1 / 60)
    // First post-hand-back frame starts from the orbit pose (plus cursor
    // spring noise at most), never from the authored (0, 0, 3) origin.
    expect(instance.position.x).toBeGreaterThan(1.5)
    expect(instance.position.y).toBeGreaterThan(0.5)
    expect(instance.position.z).toBeGreaterThan(2.5)
    camera.destroy()
    sizes.destroy()
  })

  it('stops smoothing toward the authored track while the controls are engaged', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    const sizes = new Sizes()
    const camera = new Camera(sizes, new THREE.PerspectiveCamera())

    setLabCameraActive(true)
    camera.updateSmooth(
      {
        position: new THREE.Vector3(9, 9, 9),
        lookAt: new THREE.Vector3(),
        fov: 100,
      },
      0.05,
    )
    expect(isLabCameraActive()).toBe(true)
    camera.destroy()
    sizes.destroy()
  })
})
