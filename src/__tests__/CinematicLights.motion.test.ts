import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { CinematicLights } from '../Experience/World/Lights'
import type { CinematicLightsNodes } from '../Experience/World/Lights'
import { getWorldConfigForPage } from '../core/WorldConfig'

type LightInternals = {
  keyLight: THREE.DirectionalLight
  fillLight: THREE.DirectionalLight
  rimLight: THREE.DirectionalLight
  volumetricLight: THREE.PointLight
  hemiLight: THREE.HemisphereLight
}

function internals(owner: CinematicLights): LightInternals {
  return owner as unknown as LightInternals
}

function createNodes(): CinematicLightsNodes {
  return {
    group: new THREE.Group(),
    key: new THREE.DirectionalLight(),
    fill: new THREE.DirectionalLight(),
    rim: new THREE.DirectionalLight(),
    volumetric: new THREE.PointLight(),
    hemisphere: new THREE.HemisphereLight(),
  }
}

describe('CinematicLights reduced-motion transitions', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('snaps section targets immediately when reduced motion is enabled', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    const lights = new CinematicLights(createNodes())
    const config = getWorldConfigForPage('home').find((entry) => entry.id === 'sec_works')!
    const state = internals(lights)

    lights.changeSection(config)

    expect(state.keyLight.color.getHex()).toBe(0x4466aa)
    expect(state.keyLight.intensity).toBe(1.8)
    expect(state.keyLight.position.toArray()).toEqual([0, 5, 5])
    expect(state.volumetricLight.intensity).toBe(1)
    lights.dispose()
  })

  it('settles an active interpolation when reduced motion changes at runtime', () => {
    const media = { matches: false }
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(media))
    const lights = new CinematicLights(createNodes())
    const config = getWorldConfigForPage('home').find((entry) => entry.id === 'sec_works')!
    const state = internals(lights)

    lights.changeSection(config)
    lights.update(0.01)
    expect(state.keyLight.intensity).not.toBe(1.8)

    media.matches = true
    lights.setReducedMotion(true)
    expect(state.keyLight.intensity).toBe(1.8)
    expect(state.keyLight.position.toArray()).toEqual([0, 5, 5])
    lights.dispose()
  })

  it('preserves authored interpolation when reduced motion is disabled', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    const lights = new CinematicLights(createNodes())
    const config = getWorldConfigForPage('home').find((entry) => entry.id === 'sec_works')!
    const state = internals(lights)
    const initial = state.keyLight.intensity

    lights.changeSection(config)
    lights.update(0.01)

    expect(state.keyLight.intensity).not.toBe(initial)
    expect(state.keyLight.intensity).not.toBe(1.8)
    lights.dispose()
  })

  it('stops settled transition writes without stopping the volumetric orbit', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    vi.stubGlobal('performance', { now: vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(1000) })
    const lights = new CinematicLights(createNodes())
    const config = getWorldConfigForPage('home').find((entry) => entry.id === 'sec_works')!
    const state = internals(lights)
    const colorLerp = vi.spyOn(state.keyLight.color, 'lerp')

    lights.changeSection(config)
    lights.update(1)
    const lerpCalls = colorLerp.mock.calls.length
    const beforeOrbit = state.volumetricLight.position.clone()
    lights.update(1)

    expect(colorLerp).toHaveBeenCalledTimes(lerpCalls)
    expect(state.volumetricLight.position.distanceTo(beforeOrbit)).toBeGreaterThan(0.001)
    lights.dispose()
  })

  it('ignores late section, preference and frame calls after teardown', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    const nodes = createNodes()
    const lights = new CinematicLights(nodes)
    const config = getWorldConfigForPage('home').find((entry) => entry.id === 'sec_contact')!

    lights.dispose()
    lights.dispose()
    lights.changeSection(config)
    lights.setReducedMotion(true)
    lights.update(1 / 60)

    expect(nodes.group.children).toHaveLength(0)
  })

  it('leaves declaratively-owned light nodes attached for the Vue host to dispose', () => {
    const scene = new THREE.Scene()
    const group = new THREE.Group()
    group.name = 'cinematic-lights'
    const nodes = createNodes()
    nodes.group = group
    group.add(nodes.key, nodes.fill, nodes.rim, nodes.volumetric, nodes.hemisphere)
    scene.add(group)

    const lights = new CinematicLights(nodes)
    lights.dispose()

    expect(group.parent).toBe(scene)
    expect(group.children).toHaveLength(5)
  })
})
