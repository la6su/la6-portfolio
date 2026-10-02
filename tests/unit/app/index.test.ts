import { afterEach, describe, expect, it, vi } from 'vitest'
import { eventBus } from '../../../src/core/EventBus'
import { createDeferredInitialHashGate, createSingleFrameOwner } from '../../../src/app/index'

describe('createSingleFrameOwner', () => {
  let nextFrame = 1
  let callbacks: Map<number, FrameRequestCallback>

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubAnimationFrames(): void {
    nextFrame = 1
    callbacks = new Map()
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        const id = nextFrame++
        callbacks.set(id, callback)
        return id
      }),
    )
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((id: number) => callbacks.delete(id)),
    )
  }

  it('suppresses a queued callback when a newer frame replaces it', () => {
    stubAnimationFrames()
    const owner = createSingleFrameOwner()
    const first = vi.fn()
    const second = vi.fn()

    owner.schedule(first)
    owner.schedule(second)

    expect(first).not.toHaveBeenCalled()
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1)

    callbacks.get(2)!(0)
    expect(second).toHaveBeenCalledOnce()
  })

  it('suppresses a queued callback after cancellation', () => {
    stubAnimationFrames()
    const owner = createSingleFrameOwner()
    const callback = vi.fn()

    owner.schedule(callback)
    owner.cancel()

    expect(cancelAnimationFrame).toHaveBeenCalledWith(1)
    expect(callback).not.toHaveBeenCalled()
  })
})

describe('createDeferredInitialHashGate', () => {
  it('dispatches only the newest initial hash when the runtime becomes ready', () => {
    const gate = createDeferredInitialHashGate()
    const dispatch = vi.fn()
    const unsubscribe = eventBus.on('jlz:goto-section-by-hash', dispatch)

    gate.defer('#section-old')
    gate.defer('#section-current')
    eventBus.emit('jlz:webgl-ready')

    expect(dispatch).toHaveBeenCalledOnce()
    expect(dispatch).toHaveBeenCalledWith({ hash: '#section-current' })
    unsubscribe()
  })

  it('does not dispatch a deferred hash after invalidation', () => {
    const gate = createDeferredInitialHashGate()
    const dispatch = vi.fn()
    const unsubscribe = eventBus.on('jlz:goto-section-by-hash', dispatch)

    gate.defer('#section-cancelled')
    gate.invalidate()
    eventBus.emit('jlz:webgl-ready')

    expect(dispatch).not.toHaveBeenCalled()
    unsubscribe()
  })
})
