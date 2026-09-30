import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { Camera } from '../Experience/Camera'
import { Sizes } from '../Experience/Sizes'

describe('Camera reduced-motion settlement', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('starts settled before any FOV transition is requested', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    const sizes = new Sizes()
    const camera = new Camera(sizes, new THREE.PerspectiveCamera())

    expect(camera.isPulsing).toBe(false)

    camera.destroy()
    sizes.destroy()
  })

  it('snaps persistent section framing and clears an active pulse', () => {
    const media = { matches: false }
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(media))
    vi.spyOn(THREE.PerspectiveCamera.prototype, 'lookAt').mockImplementation(() => undefined)
    const sizes = new Sizes()
    const camera = new Camera(sizes, new THREE.PerspectiveCamera())
    const internals = camera as unknown as {
      sectionFovOffset: number
      targetFovOffset: number
      fovOffset: number
      fovTransitionT: number
    }

    camera.setFovOffset(4, 1)
    camera.pulse(0.2, 0.8)
    camera.update(0.05)
    expect(camera.isPulsing).toBe(true)

    media.matches = true
    camera.setReducedMotion(true)

    expect(internals.sectionFovOffset).toBe(4)
    expect(internals.targetFovOffset).toBe(4)
    expect(internals.fovOffset).toBe(4)
    expect(internals.fovTransitionT).toBe(1)
    expect(camera.isPulsing).toBe(false)
    camera.destroy()
    sizes.destroy()
  })

  it('clears shake and does not resume it after motion is restored', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    vi.spyOn(THREE.PerspectiveCamera.prototype, 'lookAt').mockImplementation(() => undefined)
    const sizes = new Sizes()
    const camera = new Camera(sizes, new THREE.PerspectiveCamera())

    camera.shake(1, 1)
    expect(camera.isShaking).toBe(true)
    camera.setReducedMotion(true)
    expect(camera.isShaking).toBe(false)
    camera.setReducedMotion(false)
    expect(camera.isShaking).toBe(false)
    camera.destroy()
    sizes.destroy()
  })

  it('ignores late animation calls after terminal teardown', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    const sizes = new Sizes()
    const instance = new THREE.PerspectiveCamera()
    const camera = new Camera(sizes, instance)
    const initialFov = instance.fov

    camera.destroy()
    camera.destroy()
    camera.shake(1, 1)
    camera.pulse(0.2, 0.8)
    camera.setFovOffset(4)
    camera.update(1 / 60)

    expect(camera.isShaking).toBe(false)
    expect(camera.isPulsing).toBe(false)
    expect(instance.fov).toBe(initialFov)
    sizes.destroy()
  })

  it('updates the adopted camera only through the viewport port', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    const sizes = new Sizes()
    const instance = new THREE.PerspectiveCamera()
    const camera = new Camera(sizes, instance)
    const projection = vi.spyOn(instance, 'updateProjectionMatrix')

    vi.stubGlobal('innerWidth', 900)
    vi.stubGlobal('innerHeight', 600)
    window.dispatchEvent(new Event('resize'))

    // Camera owns no window listener; Experience performs this fan-out after
    // Sizes has captured the browser viewport.
    expect(instance.aspect).not.toBeCloseTo(1.5)
    sizes.resize()
    camera.resize()

    expect(instance.aspect).toBeCloseTo(1.5)
    expect(projection).toHaveBeenCalled()
    camera.destroy()
    sizes.destroy()
  })
})
