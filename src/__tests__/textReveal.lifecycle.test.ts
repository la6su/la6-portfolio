// TextReveal base lifecycle — the machinery both DOM reveal voices (BlurFade,
// NoiseText) used to test through their own subclasses. The base owns the
// RAF + safety-timeout pair, the read-before-cancel source contract (D-3/D-9)
// and the shared active set; this suite pins it once through a minimal
// harness voice. Per-class behaviour (buffers, XSS handling, disposeAll
// filters) stays in the BlurFade/NoiseText files.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TextReveal } from '../Experience/textReveal'

class HarnessReveal extends TextReveal {
  static disposeAllHarness(): void {
    TextReveal.disposeAllWhere(() => true)
  }

  readonly frames: number[] = []
  beginCalls = 0

  // Re-declared public: the inherited TextReveal constructor is protected.
  constructor(el: HTMLElement) {
    super(el)
  }

  begin(): void {
    this.beginCalls++
  }

  renderFrame(t: number): void {
    this.frames.push(t)
  }

  restoreFinalDom(): void {
    // Mirror the real voices' contract: a never-shown reveal must not clobber
    // authored DOM (finalize can run on idle instances via hide()).
    if (this.cleanText) this.el.textContent = this.cleanText
  }

  clearShowAttributes(): void {}
}

describe('TextReveal base lifecycle', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    HarnessReveal.disposeAllHarness()
    vi.useRealTimers()
  })

  function mountedHarness(text = 'Hello'): {
    element: HTMLElement
    callbacks: FrameRequestCallback[]
  } {
    const element = document.createElement('span')
    element.textContent = text
    document.body.append(element)
    const callbacks: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callbacks.push(callback)
      return callbacks.length
    })
    return { element, callbacks }
  }

  it('stops RAF and timeout work when the target leaves the document', () => {
    const cancel = vi.spyOn(window, 'cancelAnimationFrame')
    const { element, callbacks } = mountedHarness()

    new HarnessReveal(element).show(1)
    element.remove()

    callbacks[0]!(performance.now())

    expect(cancel).toHaveBeenCalledWith(1)
    expect(element.textContent).toBe('Hello')
    vi.runOnlyPendingTimers()
    // The safety timeout must not resurrect a finalized run.
    expect(vi.getTimerCount()).toBe(0)
  })

  it('continues scheduling frames while the target remains connected', () => {
    const { element, callbacks } = mountedHarness()

    new HarnessReveal(element).show(1)
    callbacks[0]!(0)

    expect(callbacks).toHaveLength(2)
  })

  it('the safety timeout finalizes a run that RAF never advanced', () => {
    const { element, callbacks } = mountedHarness()

    new HarnessReveal(element).show(1)
    vi.runOnlyPendingTimers()

    expect(element.textContent).toBe('Hello')
    // A late frame after the timeout finalize must not reschedule.
    const scheduleCount = callbacks.length
    callbacks[0]!(performance.now())
    expect(callbacks).toHaveLength(scheduleCount)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('an empty element never schedules frames or joins the active set', () => {
    const cancel = vi.spyOn(window, 'cancelAnimationFrame')
    const { element, callbacks } = mountedHarness('')

    new HarnessReveal(element).show(1)

    expect(callbacks).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
    expect(cancel).not.toHaveBeenCalled()
  })

  it('show(sourceText) captures the explicit source instead of the DOM text', () => {
    const { element } = mountedHarness('Authored')

    const reveal = new HarnessReveal(element)
    reveal.show(1, 'Explicit')

    expect(reveal.frames).toHaveLength(0) // no RAF tick ran yet
    reveal.hide()
    expect(element.textContent).toBe('Explicit')
  })

  it('re-show reads the current DOM text before cancel restores the previous source', () => {
    const { element, callbacks } = mountedHarness('Hello')

    const reveal = new HarnessReveal(element)
    reveal.show(1)
    callbacks[0]!(10)

    // A translation lands between shows (the D-3/D-9 scenario): the fresh DOM
    // text must win even though cancel() would restore the previous source.
    element.textContent = 'Bonjour'
    reveal.show(1)
    reveal.hide()

    expect(element.textContent).toBe('Bonjour')
  })

  it('does not erase authored content when hidden before its first show', () => {
    const { element } = mountedHarness('Authored')

    new HarnessReveal(element).hide()

    expect(element.textContent).toBe('Authored')
    expect(vi.getTimerCount()).toBe(0)
  })
})
