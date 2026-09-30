// BlurFade voice lifecycle. The shared TextReveal machinery (RAF + safety
// timeout, disconnect finalize, read-before-cancel source contract) is pinned
// once in textReveal.lifecycle.test.ts; this file keeps BlurFade's own
// contracts: markup-safe text splitting, the disposeAll instanceof filter,
// the rotation cache and the restore-on-hide flow.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BlurFade } from '../Experience/BlurFade'

describe('BlurFade lifecycle', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    BlurFade.disposeAll()
    vi.useRealTimers()
  })

  it('keeps editorial text as text instead of parsing it as markup', () => {
    const element = document.createElement('h2')
    document.body.append(element)

    BlurFade.for(element).show(1, '<img src=x onerror=alert(1)>')

    expect(element.querySelector('img')).toBeNull()
    expect(element.querySelectorAll('span')).toHaveLength('<img src=x onerror=alert(1)>'.length)
    expect(element.getAttribute('aria-label')).toBe('<img src=x onerror=alert(1)>')
  })

  it('stops connected animation owners during runtime teardown', () => {
    const callbacks: FrameRequestCallback[] = []
    const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callbacks.push(callback)
      return callbacks.length
    })
    const cancel = vi.spyOn(window, 'cancelAnimationFrame')
    const element = document.createElement('h2')
    element.textContent = 'Hello'
    document.body.append(element)

    BlurFade.for(element).show(1)
    BlurFade.disposeAll()

    expect(cancel).toHaveBeenCalledWith(1)
    expect(vi.getTimerCount()).toBe(0)
    const requestCount = request.mock.calls.length
    callbacks[0]!(performance.now())
    expect(request).toHaveBeenCalledTimes(requestCount)
    expect(element.querySelectorAll('span')).toHaveLength(5)
  })

  it('caches authored rotations instead of parsing span data every tick', () => {
    const callbacks: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callbacks.push(callback)
      return callbacks.length
    })
    const element = document.createElement('span')
    element.textContent = 'Hello'
    document.body.append(element)

    const instance = BlurFade.for(element) as unknown as { rotations: number[] }
    BlurFade.for(element).show(1)
    const rotations = instance.rotations
    callbacks[0]!(100)
    callbacks[1]!(200)

    expect(instance.rotations).toBe(rotations)
    expect(instance.rotations).toHaveLength(5)
  })

  it('restores authored text after hiding a revealed title', () => {
    const element = document.createElement('h2')
    element.textContent = 'Hello'
    element.setAttribute('aria-label', 'old label')
    document.body.append(element)

    const fade = BlurFade.for(element)
    fade.show(1)
    fade.hide()

    expect(element.textContent).toBe('Hello')
    expect(element.children).toHaveLength(0)
    expect(element.hasAttribute('data-visible')).toBe(false)
    expect(element.hasAttribute('aria-label')).toBe(false)
  })
})
