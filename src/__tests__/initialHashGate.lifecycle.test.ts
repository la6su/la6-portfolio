import { afterEach, describe, expect, it, vi } from 'vitest'
import { eventBus } from '../core/EventBus'
import { createDeferredInitialHashGate, createSingleFrameOwner } from '../app'

describe('initial route hash lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not dispatch a stale hash after invalidation', () => {
    const emit = vi.spyOn(eventBus, 'emit')
    const gate = createDeferredInitialHashGate()

    gate.defer('#section-old')
    gate.invalidate()
    eventBus.emit('jlz:webgl-ready')

    expect(emit).not.toHaveBeenCalledWith('jlz:goto-section-by-hash', {
      hash: '#section-old',
    })
  })

  it('dispatches only the current deferred hash once ready', () => {
    const emit = vi.spyOn(eventBus, 'emit')
    const gate = createDeferredInitialHashGate()

    gate.defer('#section-old')
    gate.defer('#section-current')
    eventBus.emit('jlz:webgl-ready')
    eventBus.emit('jlz:webgl-ready')

    expect(emit).toHaveBeenCalledWith('jlz:goto-section-by-hash', {
      hash: '#section-current',
    })
    expect(emit.mock.calls.filter(([event]) => event === 'jlz:goto-section-by-hash')).toHaveLength(
      1,
    )
  })

  it('cancels and invalidates a superseded hash-navigation frame', () => {
    const callbacks: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callbacks.push(callback)
      return callbacks.length
    })
    const cancel = vi.spyOn(window, 'cancelAnimationFrame')
    const owner = createSingleFrameOwner()
    const stale = vi.fn()
    const current = vi.fn()

    owner.schedule(stale)
    owner.schedule(current)
    callbacks[0]?.(0)
    callbacks[1]?.(0)

    expect(cancel).toHaveBeenCalledWith(1)
    expect(stale).not.toHaveBeenCalled()
    expect(current).toHaveBeenCalledOnce()
  })
})
