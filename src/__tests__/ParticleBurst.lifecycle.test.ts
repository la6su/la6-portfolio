import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import {
  INTRO_TRACE_COUNT,
  ParticleBurst,
  type IntroLightFramesNodes,
} from '../Experience/World/ParticleBurst'

function makeBurstNodes(): IntroLightFramesNodes {
  return {
    mesh: new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial(),
      INTRO_TRACE_COUNT,
    ),
  }
}

describe('ParticleBurst lifecycle', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('becomes terminal after disposal and ignores late triggers', () => {
    const nodes = makeBurstNodes()
    const burst = new ParticleBurst(nodes)
    burst.trigger(1, 2, 3)
    expect(burst.isActive).toBe(true)

    const materialDispose = vi.spyOn(nodes.mesh.material as THREE.Material, 'dispose')
    burst.dispose()
    burst.dispose()
    burst.trigger()

    // The TSL trace material is controller-created; the Tres-built geometry
    // stays with the Vue host.
    expect(materialDispose).toHaveBeenCalledOnce()
    expect(burst.isActive).toBe(false)
    expect(burst.update(1 / 60)).toBe(false)
  })

  it('keeps TSL trace uniforms isolated between burst owners', () => {
    const first = new ParticleBurst(makeBurstNodes())
    const second = new ParticleBurst(makeBurstNodes())
    const firstUniforms = (first as unknown as { _uniforms: { uTime: { value: number } } })
      ._uniforms
    const secondUniforms = (second as unknown as { _uniforms: { uTime: { value: number } } })
      ._uniforms

    first.trigger()
    first.update(0.2)

    expect(firstUniforms).not.toBe(secondUniforms)
    expect(firstUniforms.uTime.value).toBeGreaterThan(0)
    expect(secondUniforms.uTime.value).toBe(0)

    first.dispose()
    second.dispose()
  })

  it('does not start or retain a burst under reduced motion', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    const burst = new ParticleBurst(makeBurstNodes())

    burst.trigger()
    expect(burst.isActive).toBe(false)
    expect(burst.visible).toBe(false)

    burst.setReducedMotion(false)
    burst.trigger()
    expect(burst.isActive).toBe(true)
    burst.setReducedMotion(true)
    expect(burst.isActive).toBe(false)
    expect(burst.visible).toBe(false)
    burst.dispose()
  })
})
