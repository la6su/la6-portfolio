// NoiseText voice lifecycle. The shared TextReveal machinery (RAF + safety
// timeout, disconnect finalize, read-before-cancel source contract) is pinned
// once in textReveal.lifecycle.test.ts; this file keeps NoiseText's own
// contracts: the frame-buffer reuse, the disposeAll instanceof filter and the
// hide-before-show guard.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NoiseText } from '../Experience/NoiseText'

describe('NoiseText lifecycle', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    NoiseText.disposeAll()
    vi.useRealTimers()
  })

  it('reuses its frame buffer across animation ticks', () => {
    const callbacks: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callbacks.push(callback)
      return callbacks.length
    })
    const element = document.createElement('span')
    element.textContent = 'Hello'
    document.body.append(element)

    const instance = NoiseText.for(element) as unknown as { chars: string[] }
    NoiseText.for(element).show(1)
    callbacks[0]!(100)
    const buffer = instance.chars
    callbacks[1]!(200)

    expect(instance.chars).toBe(buffer)
    expect(instance.chars.length).toBeGreaterThan(0)
  })

  it('stops connected animation owners during runtime teardown', () => {
    const callbacks: FrameRequestCallback[] = []
    const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callbacks.push(callback)
      return callbacks.length
    })
    const cancel = vi.spyOn(window, 'cancelAnimationFrame')
    const element = document.createElement('span')
    element.textContent = 'Hello'
    document.body.append(element)

    NoiseText.for(element).show(1)
    NoiseText.disposeAll()

    expect(cancel).toHaveBeenCalledWith(1)
    expect(vi.getTimerCount()).toBe(0)
    const requestCount = request.mock.calls.length
    callbacks[0]!(performance.now())
    expect(request).toHaveBeenCalledTimes(requestCount)
    expect(element.textContent).toBe('Hello')
  })

  it('does not erase authored content when hidden before its first show', () => {
    const element = document.createElement('span')
    element.textContent = 'Authored'
    document.body.append(element)

    NoiseText.for(element).hide()

    expect(element.textContent).toBe('Authored')
    expect(vi.getTimerCount()).toBe(0)
  })
})
