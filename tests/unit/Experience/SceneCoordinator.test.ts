import { describe, expect, it, vi } from 'vitest'
import { SceneCoordinator } from '../../../src/Experience/SceneCoordinator'

describe('SceneCoordinator reduced-motion ownership', () => {
  it('forwards the live policy to scene owners and invalidates transforms', () => {
    const owners = {
      envSphere: { setReducedMotion: vi.fn() },
      baku: { setReducedMotion: vi.fn() },
      carousel: { setReducedMotion: vi.fn() },
      particleBurst: { setReducedMotion: vi.fn() },
      stages: { setReducedMotion: vi.fn() },
      drawTrail: { setReducedMotion: vi.fn() },
    }
    const invalidate = vi.fn()
    const coordinator = Object.assign(
      Object.create(SceneCoordinator.prototype) as object,
      { owners, _transform: { invalidate }, isReducedMotion: () => false },
    ) as unknown as SceneCoordinator

    coordinator.setReducedMotion(true)

    for (const owner of Object.values(owners)) {
      expect(owner.setReducedMotion).toHaveBeenCalledOnce()
      expect(owner.setReducedMotion).toHaveBeenCalledWith(true)
    }
    expect(invalidate).toHaveBeenCalledOnce()
  })

  it('handles a missing lazy carousel', () => {
    const invalidate = vi.fn()
    const owners = {
      envSphere: { setReducedMotion: vi.fn() },
      baku: { setReducedMotion: vi.fn() },
      particleBurst: { setReducedMotion: vi.fn() },
      stages: { setReducedMotion: vi.fn() },
      drawTrail: { setReducedMotion: vi.fn() },
    }
    const coordinator = Object.assign(
      Object.create(SceneCoordinator.prototype) as object,
      {
        owners: {
          ...owners,
          carousel: null,
        },
        _transform: { invalidate },
        isReducedMotion: () => false,
      },
    ) as unknown as SceneCoordinator

    coordinator.setReducedMotion(false)

    for (const owner of Object.values(owners)) {
      expect(owner.setReducedMotion).toHaveBeenCalledWith(false)
    }
    expect(invalidate).toHaveBeenCalledOnce()
  })

  it('reads reduced-motion policy from its owning runtime', () => {
    let reduced = false
    const coordinator = Object.assign(
      Object.create(SceneCoordinator.prototype) as object,
      {
        isReducedMotion: () => reduced,
        owners: { envSphere: { isAnimating: true } },
      },
    ) as unknown as SceneCoordinator

    expect(coordinator.hasVisibleAmbientMotion()).toBe(true)
    reduced = true
    expect(coordinator.hasVisibleAmbientMotion()).toBe(false)
  })
})
