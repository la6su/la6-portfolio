import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../core/motionPolicy', () => ({
  prefersReducedMotion: () => false,
}))

import { RouteTransition } from '../UI/RouteTransition'

describe('RouteTransition failure lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers()
    document.body.replaceChildren()
  })

  it('returns a covered transition to idle when navigation fails', async () => {
    vi.useFakeTimers()
    const transition = new RouteTransition()
    const covering = transition.cover()
    const overlay = document.querySelector<HTMLElement>('.jlz-route-transition')

    expect(overlay?.dataset.state).toBe('covering')
    transition.cancel()
    expect(overlay?.dataset.state).toBe('idle')

    vi.advanceTimersByTime(260)
    await covering
  })

  it('invalidates a pending reveal after cancellation', async () => {
    vi.useFakeTimers()
    const transition = new RouteTransition()
    const covering = transition.cover()
    vi.advanceTimersByTime(260)
    await covering
    transition.reveal()
    const overlay = document.querySelector<HTMLElement>('.jlz-route-transition')

    transition.cancel()
    vi.advanceTimersByTime(420)
    await Promise.resolve()

    expect(overlay?.dataset.state).toBe('idle')
  })

  it('clears the pending reveal timer instead of leaving stale work queued', async () => {
    vi.useFakeTimers()
    const transition = new RouteTransition()
    const covering = transition.cover()
    vi.advanceTimersByTime(260)
    await covering
    transition.reveal()

    expect(vi.getTimerCount()).toBe(1)
    transition.cancel()

    expect(vi.getTimerCount()).toBe(0)
  })

  it('replaces a pending cover timer when a newer navigation starts', async () => {
    vi.useFakeTimers()
    const transition = new RouteTransition()
    const first = transition.cover()

    expect(vi.getTimerCount()).toBe(1)
    const second = transition.cover()

    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(260)
    await Promise.all([first, second])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels an old reveal when a new cover starts', async () => {
    vi.useFakeTimers()
    const transition = new RouteTransition()
    transition.reveal()
    const covering = transition.cover()
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(420)
    await covering
    expect(document.querySelector('.jlz-route-transition')?.getAttribute('data-state')).toBe(
      'covering',
    )
    transition.dispose()
  })

  it('releases the cover timer immediately when navigation is cancelled', async () => {
    vi.useFakeTimers()
    const transition = new RouteTransition()
    const covering = transition.cover()

    transition.cancel()

    expect(vi.getTimerCount()).toBe(0)
    await covering
  })

  it('leaves no timer after a successful cover phase', async () => {
    vi.useFakeTimers()
    const transition = new RouteTransition()
    const covering = transition.cover()

    vi.advanceTimersByTime(260)
    await covering

    expect(vi.getTimerCount()).toBe(0)
  })

  it('disposes the DOM owner and all pending transition work', async () => {
    vi.useFakeTimers()
    const transition = new RouteTransition()
    const covering = transition.cover()
    const overlay = document.querySelector('.jlz-route-transition')
    expect(overlay).not.toBeNull()

    transition.dispose()

    expect(document.querySelector('.jlz-route-transition')).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    await covering
    transition.dispose()
  })
})
