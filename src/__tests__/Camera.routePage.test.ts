import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { Camera } from '../Experience/Camera'
import { Sizes } from '../Experience/Sizes'
import { setCurrentPage } from '../core/routePage'
import { input } from '../Experience/Input'

type CameraInternals = {
  shakeDuration: number
}

describe('Camera route ownership', () => {
  beforeEach(() => {
    setCurrentPage('home')
    vi.spyOn(THREE.PerspectiveCamera.prototype, 'lookAt').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.removeAttribute('data-page')
  })

  it('uses the typed route port instead of the body dataset', () => {
    const sizes = new Sizes()
    const camera = new Camera(sizes, new THREE.PerspectiveCamera())
    camera.instance.fov = 75
    camera.instance.aspect = 1
    document.body.dataset.page = 'contact'

    camera.update(1 / 60)
    const homeFov = camera.instance.fov

    expect(homeFov).toBeGreaterThan(75)
    setCurrentPage('contact')
    camera.update(1 / 60)
    const contactFov = camera.instance.fov

    expect(contactFov).not.toBe(homeFov)
    camera.destroy()
    sizes.destroy()
  })

  it('keeps shake timing proportional on high-refresh updates', () => {
    const sizes = new Sizes()
    const camera = new Camera(sizes, new THREE.PerspectiveCamera())
    const internals = camera as unknown as CameraInternals

    camera.shake(1, 1)
    for (let i = 0; i < 120; i += 1) camera.update(1 / 240)

    expect(internals.shakeDuration).toBeCloseTo(0.5, 2)
    camera.destroy()
    sizes.destroy()
  })

  it('keeps cursor spring state isolated between camera owners', () => {
    const sizes = new Sizes()
    const first = new Camera(sizes, new THREE.PerspectiveCamera())
    const second = new Camera(sizes, new THREE.PerspectiveCamera())
    const firstState = first as unknown as { springX: { pos: number } }
    const secondState = second as unknown as { springX: { pos: number } }

    input.mouse.set(1, 0)
    first.update(1 / 60)
    const firstPosition = firstState.springX.pos

    input.mouse.set(-1, 0)
    second.update(1 / 60)

    expect(firstState.springX.pos).toBe(firstPosition)
    expect(secondState.springX.pos).not.toBe(firstPosition)

    first.destroy()
    second.destroy()
    sizes.destroy()
    input.mouse.set(0, 0)
  })
})
