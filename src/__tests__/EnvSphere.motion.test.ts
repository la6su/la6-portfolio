import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { EnvSphere } from '../Experience/World/EnvSphere'

describe('EnvSphere reduced-motion transitions', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('can delegate the static sky geometry while retaining its palette material', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    const sphere = new EnvSphere()
    const dispose = vi.spyOn(sphere.skyMaterial, 'dispose')
    const initialSkyColor = sphere.skyMaterial.color.getHex()

    expect(sphere.getObjectByName('pavilion-sky')).toBeUndefined()
    sphere.changeSection(3, false)
    expect(sphere.skyMaterial.color.getHex()).not.toBe(initialSkyColor)

    sphere.dispose()
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('snaps the palette instead of leaving an intermediate color', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    const sphere = new EnvSphere()
    const back = (sphere.children[0] as THREE.Mesh | undefined)?.material as THREE.MeshBasicMaterial

    sphere.changeSection(3, false)

    expect(back.color.getHex()).toBe(0x0b1018)
    sphere.update(1)
    expect(back.color.getHex()).toBe(0x0b1018)
    sphere.dispose()
    expect(sphere.parent).toBeNull()
  })

  it('keeps the authored color interpolation when motion is enabled', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    const sphere = new EnvSphere()
    const back = (sphere.children[0] as THREE.Mesh | undefined)?.material as THREE.MeshBasicMaterial
    const initial = back.color.getHex()

    sphere.changeSection(3, false)

    expect(back.color.getHex()).toBe(initial)
    expect(sphere.isAnimating).toBe(true)
    sphere.update(0.25)
    expect(back.color.getHex()).not.toBe(initial)
    sphere.snapToSection(3, false)
    expect(sphere.isAnimating).toBe(false)
    sphere.dispose()
    expect(sphere.parent).toBeNull()
  })

  it('uses the synchronized motion snapshot for later section changes', () => {
    const media = { matches: false }
    const matchMedia = vi.fn().mockReturnValue(media)
    vi.stubGlobal('matchMedia', matchMedia)
    const sphere = new EnvSphere()

    sphere.setReducedMotion(true)
    media.matches = false
    sphere.changeSection(3, false)

    const back = (sphere.children[0] as THREE.Mesh | undefined)?.material as THREE.MeshBasicMaterial
    expect(back.color.getHex()).toBe(0x0b1018)
    expect(matchMedia).toHaveBeenCalledTimes(1)
    sphere.dispose()
  })

  it('settles an active crossfade synchronously when motion is reduced', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    const sphere = new EnvSphere()
    const back = (sphere.children[0] as THREE.Mesh | undefined)?.material as THREE.MeshBasicMaterial

    sphere.changeSection(3, false)
    sphere.update(0.1)
    const intermediate = back.color.getHex()

    sphere.setReducedMotion(true)

    expect(back.color.getHex()).toBe(0x0b1018)
    expect(back.color.getHex()).not.toBe(intermediate)
    expect(sphere.isAnimating).toBe(false)
    sphere.dispose()
    expect(sphere.parent).toBeNull()
  })

  it('reuses section weight arrays across transitions', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    const sphere = new EnvSphere()
    const state = sphere as unknown as { _sectionWeights: number[]; _targetWeights: number[] }
    const sectionWeights = state._sectionWeights
    const targetWeights = state._targetWeights

    sphere.changeSection(3, false)
    sphere.snapToSection(4, false)

    expect(state._sectionWeights).toBe(sectionWeights)
    expect(state._targetWeights).toBe(targetWeights)
    sphere.dispose()
  })

  it('ignores late palette and frame calls after terminal teardown', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    const sphere = new EnvSphere()

    sphere.dispose()
    sphere.dispose()
    sphere.changeSection(3, true)
    sphere.snapToSection(4, false)
    sphere.setReducedMotion(true)
    sphere.update(1 / 60)

    expect(sphere.children).toHaveLength(0)
    expect(sphere.parent).toBeNull()
  })
})
