import { describe, expect, it, vi } from 'vitest'
import { DrawTrail, type CursorTrailNodes } from '../Experience/World/DrawTrail'
import * as THREE from 'three'

function makeTrailNodes(): CursorTrailNodes {
  const ribbon = new THREE.Mesh()
  const root = new THREE.Group()
  root.add(ribbon)
  return { root, ribbon }
}

describe('DrawTrail lifecycle', () => {
  it('releases the owned ribbon resources and leaves the declarative group to Vue', () => {
    const nodes = makeTrailNodes()
    const trail = new DrawTrail(nodes)
    expect(trail.object.children).toHaveLength(1)
    const geometryDispose = vi.spyOn(nodes.ribbon.geometry, 'dispose')
    const materialDispose = vi.spyOn(nodes.ribbon.material as THREE.Material, 'dispose')

    trail.dispose()
    // Dispose stays re-runnable (the reduced-motion proxy already
    // neutralizes every behavior path — no terminal flag by design).
    expect(() => trail.dispose()).not.toThrow()

    expect(geometryDispose).toHaveBeenCalled()
    expect(materialDispose).toHaveBeenCalled()
    // The declarative nodes stay with the Vue host — disposal is not removal.
    expect(trail.object.children).toHaveLength(1)
  })

  it('reuses camera basis scratch vectors across ribbon rebuilds', () => {
    const trail = new DrawTrail(makeTrailNodes())
    const camera = new THREE.PerspectiveCamera()
    const internals = trail as unknown as {
      _cameraRight: THREE.Vector3
      _cameraUp: THREE.Vector3
      _cameraForward: THREE.Vector3
    }
    const right = internals._cameraRight
    const up = internals._cameraUp
    const forward = internals._cameraForward

    trail.update(1 / 60, camera)
    trail.update(1 / 60, camera)

    expect(internals._cameraRight).toBe(right)
    expect(internals._cameraUp).toBe(up)
    expect(internals._cameraForward).toBe(forward)
    trail.dispose()
  })

  it('rebuilds only for pointer or camera-basis changes while settled frames stay idle', () => {
    const trail = new DrawTrail(makeTrailNodes())
    const camera = new THREE.PerspectiveCamera()
    const internals = trail as unknown as {
      _rebuildRibbon: (value: THREE.Camera) => void
      _uniforms: { uTime: { value: number }; uEnergy: { value: number } }
    }
    const rebuild = vi.spyOn(internals, '_rebuildRibbon')

    trail.update(1 / 60, camera)
    rebuild.mockClear()
    const timeBefore = internals._uniforms.uTime.value
    trail.update(1 / 60, camera)

    expect(rebuild).not.toHaveBeenCalled()
    expect(internals._uniforms.uTime.value).toBe(timeBefore)

    camera.rotation.y = 0.1
    camera.updateMatrixWorld()
    trail.update(1 / 60, camera)
    expect(rebuild).toHaveBeenCalledOnce()

    trail.dispose()
  })

  it('skips settled basis and unprojection work until the pointer or camera wakes it', () => {
    const trail = new DrawTrail(makeTrailNodes())
    const camera = new THREE.PerspectiveCamera()
    const extractBasis = vi.spyOn(camera.matrixWorld, 'extractBasis')
    const unproject = vi.spyOn(THREE.Vector3.prototype, 'unproject')

    trail.update(1 / 60, camera)
    extractBasis.mockClear()
    unproject.mockClear()
    trail.update(1 / 60, camera)

    expect(extractBasis).not.toHaveBeenCalled()
    expect(unproject).not.toHaveBeenCalled()

    camera.position.x = 1
    camera.updateMatrixWorld()
    trail.update(1 / 60, camera)
    expect(extractBasis).toHaveBeenCalled()
    expect(unproject).toHaveBeenCalled()

    unproject.mockRestore()
    extractBasis.mockRestore()
    trail.dispose()
  })

  it('keeps TSL uniform state isolated between trail owners', () => {
    const first = new DrawTrail(makeTrailNodes())
    const second = new DrawTrail(makeTrailNodes())
    const firstUniforms = (first as unknown as { _uniforms: { uEnergy: { value: number } } })
      ._uniforms
    const secondUniforms = (second as unknown as { _uniforms: { uEnergy: { value: number } } })
      ._uniforms

    firstUniforms.uEnergy.value = 0.37

    expect(firstUniforms).not.toBe(secondUniforms)
    expect(secondUniforms.uEnergy.value).not.toBe(0.37)

    first.dispose()
    second.dispose()
  })

  it('settles energy and motion uniforms when reduced motion is enabled', () => {
    const trail = new DrawTrail(makeTrailNodes())
    const internals = trail as unknown as {
      _energy: number
      _velocity: number
      _uniforms: { uEnergy: { value: number }; uVelocity: { value: number } }
    }
    internals._energy = 1
    internals._velocity = 0.4
    internals._uniforms.uEnergy.value = 1
    internals._uniforms.uVelocity.value = 0.4

    trail.setReducedMotion(true)

    expect(trail.isAnimating).toBe(false)
    expect(internals._energy).toBe(0)
    expect(internals._velocity).toBe(0)
    expect(internals._uniforms.uEnergy.value).toBe(0)
    expect(internals._uniforms.uVelocity.value).toBe(0)
    trail.dispose()
  })
})
