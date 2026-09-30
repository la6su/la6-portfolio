import { afterEach, describe, expect, it, vi } from 'vitest'
import { SfxSystem } from '../core/SfxSystem'

describe('SfxSystem lifecycle', () => {
  const originalAudioContext = window.AudioContext

  afterEach(() => {
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: originalAudioContext,
    })
  })

  it('lazy-initializes one context on the first unmuted play', () => {
    const close = vi.fn()
    const construct = vi.fn()
    class FakeAudioContext {
      currentTime = 0
      state = 'running' as AudioContextState
      destination = {}
      constructor() {
        construct()
      }
      createGain() {
        return {
          gain: {
            value: 0,
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn().mockReturnThis(),
        }
      }
      createOscillator() {
        return {
          type: 'sine',
          frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
          connect: vi.fn().mockReturnThis(),
          start: vi.fn(),
          stop: vi.fn(),
        }
      }
      close = close
    }
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: FakeAudioContext })

    const sfx = new SfxSystem()
    sfx.play('hover')

    expect(construct).toHaveBeenCalledOnce()
    sfx.dispose()
    expect(close).toHaveBeenCalledOnce()
  })

  it('does not recreate an AudioContext after disposal', () => {
    const construct = vi.fn()
    class FakeAudioContext {
      constructor() {
        construct()
      }
    }
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: FakeAudioContext })

    const sfx = new SfxSystem()
    sfx.dispose()
    sfx.play('hover')

    expect(construct).not.toHaveBeenCalled()
  })
})
