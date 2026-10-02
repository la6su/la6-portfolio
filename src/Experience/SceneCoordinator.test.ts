import { describe, expect, it, vi } from 'vitest'
import { SceneCoordinator } from './SceneCoordinator'

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
      { owners, _transform: { invalidate }, _reducedMotion: false },
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
        _reducedMotion: false,
      },
    ) as unknown as SceneCoordinator

    coordinator.setReducedMotion(false)

    for (const owner of Object.values(owners)) {
      expect(owner.setReducedMotion).toHaveBeenCalledWith(false)
    }
    expect(invalidate).toHaveBeenCalledOnce()
  })
})
