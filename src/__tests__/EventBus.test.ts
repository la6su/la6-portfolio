import { describe, it, expect, vi } from 'vitest'
import { eventBus } from '../core/EventBus'

describe('EventBus', () => {
  it('calls subscriber on emit', () => {
    let received: string | undefined
    const unsub = eventBus.on('jlz:webgl-ready', () => {
      received = 'fired'
    })
    eventBus.emit('jlz:webgl-ready')
    expect(received).toBe('fired')
    unsub()
  })

  it('unsubscribes correctly', () => {
    let count = 0
    const unsub = eventBus.on('jlz:route-change', () => {
      count++
    })
    eventBus.emit('jlz:route-change', { page: 'home' })
    expect(count).toBe(1)
    unsub()
    eventBus.emit('jlz:route-change', { page: 'home' })
    expect(count).toBe(1)
  })

  it('passes payload to subscriber', () => {
    let receivedIndex: number | undefined
    eventBus.on('jlz:section-change', (payload) => {
      receivedIndex = payload.index
    })
    eventBus.emit('jlz:section-change', {
      sectionId: 'about',
      index: 1,
    })
    expect(receivedIndex).toBe(1)
  })

  it('off() removes subscriber', () => {
    let count = 0
    const handler = () => {
      count++
    }
    eventBus.on('jlz:webgl-ready', handler)
    eventBus.emit('jlz:webgl-ready')
    expect(count).toBe(1)
    eventBus.off('jlz:webgl-ready', handler)
    eventBus.emit('jlz:webgl-ready')
    expect(count).toBe(1)
  })

  it('dispatches a stable snapshot when a handler tears down listeners', () => {
    const calls: string[] = []
    const teardown: { removeSibling?: () => void } = {}
    const first = (): void => {
      calls.push('first')
      teardown.removeSibling?.()
    }
    const sibling = (): void => {
      calls.push('sibling')
    }
    eventBus.on('jlz:webgl-ready', first)
    teardown.removeSibling = eventBus.on('jlz:webgl-ready', sibling)

    eventBus.emit('jlz:webgl-ready')

    expect(calls).toEqual(['first', 'sibling'])
    eventBus.clear()
  })

  it('clear() removes all subscribers', () => {
    let count = 0
    eventBus.on('jlz:webgl-ready', () => {
      count++
    })
    eventBus.on('jlz:route-change', () => {
      count++
    })
    eventBus.clear()
    eventBus.emit('jlz:webgl-ready')
    eventBus.emit('jlz:route-change', { page: 'home' })
    expect(count).toBe(0)
  })

  it('does not bridge to window.dispatchEvent (raw window path removed)', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    let count = 0
    const unsub = eventBus.on('jlz:route-change', () => {
      count++
    })
    eventBus.emit('jlz:route-change', { page: 'home' })
    expect(count).toBe(1)
    expect(dispatchSpy).not.toHaveBeenCalled()
    unsub()
    dispatchSpy.mockRestore()
  })
})
