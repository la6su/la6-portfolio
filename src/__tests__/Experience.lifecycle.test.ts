import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { Experience } from '../Experience/Experience'
import { seedExperience } from './experienceSeed'

type LifecycleProbe = {
  lifecycleToken: () => number
  isLifecycleCurrent: (token: number) => boolean
  invalidate: () => void
}

describe('Experience async lifecycle guard', () => {
  it('invalidates a pending continuation after destroy', async () => {
    const experience = Object.assign(Object.create(Experience.prototype), {
      _destroyed: false,
      _lifecycleGeneration: 0,
    }) as Experience
    const probe = experience as unknown as LifecycleProbe
    probe.invalidate = () => {
      ;(experience as unknown as { _destroyed: boolean })._destroyed = true
      ;(experience as unknown as { _lifecycleGeneration: number })._lifecycleGeneration++
    }

    const token = probe.lifecycleToken()
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const continuation = pending.then(() => probe.isLifecycleCurrent(token))

    probe.invalidate()
    release()

    await expect(continuation).resolves.toBe(false)
  })

  it('keeps a live generation valid until invalidated', () => {
    const experience = Object.assign(Object.create(Experience.prototype), {
      _destroyed: false,
      _lifecycleGeneration: 4,
    }) as Experience
    const probe = experience as unknown as LifecycleProbe
    const token = probe.lifecycleToken()

    expect(probe.isLifecycleCurrent(token)).toBe(true)
  })

  it('tears down safely when renderer init failed before world owners existed', () => {
    const scheduler = { destroy: vi.fn() }
    const renderer = { dispose: vi.fn() }
    const camera = { destroy: vi.fn() }
    const sizes = { destroy: vi.fn() }
    const sfx = { dispose: vi.fn() }
    const features = { destroy: vi.fn() }
    const { exp: experience } = seedExperience({
      _destroyed: false,
      _lifecycleGeneration: 0,
      _scheduler: scheduler,
      _mouseTrailRafId: null,
      _onMouseMoveForTrail: null,
      _readinessGate: null,
      features,
      renderer,
      camera,
      sizes,
      sfx,
      scene: new THREE.Scene(),
    })

    expect(() => experience.destroy()).not.toThrow()
    expect(scheduler.destroy).toHaveBeenCalledOnce()
    expect(renderer.dispose).toHaveBeenCalledOnce()
    expect(camera.destroy).toHaveBeenCalledOnce()
    expect(sizes.destroy).toHaveBeenCalledOnce()
    expect(sfx.dispose).toHaveBeenCalledOnce()
  })

  it('stops the demand loop after an update failure without losing a later retry', () => {
    const experience = Object.assign(Object.create(Experience.prototype), {
      _needsRender: true,
      _updateFailed: false,
      _updateErrorLogged: false,
      _updateInner: vi.fn(() => {
        throw new Error('frame failed')
      }),
    }) as Experience
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    experience.update(1)

    expect((experience as unknown as { _needsRender: boolean })._needsRender).toBe(false)
    expect((experience as unknown as { _updateFailed: boolean })._updateFailed).toBe(true)
    expect((experience as unknown as { _isLoopSettled: () => boolean })._isLoopSettled()).toBe(true)

    ;(experience as unknown as { _updateInner: () => void })._updateInner = vi.fn()
    experience.update(2)

    expect((experience as unknown as { _updateFailed: boolean })._updateFailed).toBe(false)
    expect(error).toHaveBeenCalledOnce()
  })
})
