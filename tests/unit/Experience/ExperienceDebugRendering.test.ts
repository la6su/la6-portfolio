import { describe, expect, it, vi } from 'vitest'
import { NO_ACTIVITY } from '../../../src/core/renderDemand'
import { Experience } from '../../../src/Experience/Experience'

describe('Experience debug continuous rendering', () => {
  it('wakes the loop and prevents settling until the override is disabled', () => {
    const requestRender = vi.fn()
    const runtime = Object.assign(Object.create(Experience.prototype), {
      _destroyed: false,
      _debugContinuousRendering: false,
      _needsRender: false,
      _updateFailed: false,
      _renderDisabled: false,
      _activitySnapshot: { ...NO_ACTIVITY },
      _raiseRenderDemand: requestRender,
    }) as {
      setDebugContinuousRendering: (enabled: boolean) => void
      needsRender: boolean
      _isLoopSettled: () => boolean
    }

    expect(runtime._isLoopSettled()).toBe(true)
    runtime.setDebugContinuousRendering(true)

    expect(requestRender).toHaveBeenCalledOnce()
    expect(requestRender).toHaveBeenCalledWith('external')
    expect(runtime._isLoopSettled()).toBe(false)
    expect(runtime.needsRender).toBe(true)

    runtime.setDebugContinuousRendering(false)
    expect(runtime._isLoopSettled()).toBe(true)
  })

  it('does not wake a destroyed Experience', () => {
    const requestRender = vi.fn()
    const runtime = Object.assign(Object.create(Experience.prototype), {
      _destroyed: true,
      _debugContinuousRendering: false,
      _raiseRenderDemand: requestRender,
    }) as { setDebugContinuousRendering: (enabled: boolean) => void }

    runtime.setDebugContinuousRendering(true)
    expect(requestRender).not.toHaveBeenCalled()
  })
})

describe('Experience reduced-motion changes', () => {
  it('requests a draw after scene owners snap their motion state', () => {
    const requestRender = vi.fn()
    const cancelBreath = vi.fn()
    const settleNow = vi.fn()
    const ownerChange = vi.fn()
    const runtime = Object.assign(Object.create(Experience.prototype), {
      _destroyed: false,
      _reducedMotion: false,
      renderer: { postManager: { setReducedMotion: ownerChange } },
      coordinator: { setReducedMotion: ownerChange },
      lights: { setReducedMotion: ownerChange },
      camera: { setReducedMotion: ownerChange },
      _showreel: { setReducedMotion: ownerChange },
      features: { storyNav: { setReducedMotion: ownerChange } },
      _cancelBreath: cancelBreath,
      _scheduler: { settleNow },
      _raiseRenderDemand: requestRender,
    }) as { _handleReducedMotionChange: (reduced: boolean) => void }

    runtime._handleReducedMotionChange(true)

    expect(ownerChange).toHaveBeenCalledTimes(6)
    expect(ownerChange).toHaveBeenCalledWith(true)
    expect(cancelBreath).toHaveBeenCalledOnce()
    expect(requestRender).toHaveBeenCalledOnce()
    expect(requestRender).toHaveBeenCalledWith('motion-preference')
    expect(settleNow).not.toHaveBeenCalled()
  })
})
