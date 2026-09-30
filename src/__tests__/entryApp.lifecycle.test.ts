import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createReadyEventTimer,
  createStyleOwner,
  initSplashToggles,
  updateLoaderProgress,
} from '../entry-app'

function mountSplashMeta(): void {
  document.body.innerHTML = `
    <div class="jlz-splash-meta">
      <span class="jlz-splash-percent" data-jlz-splash="progress"> 00% </span>
      <span id="jlz-splash-status" data-jlz-splash="state"> INITIALIZING </span>
    </div>
  `
}

function mountSplashToggles(): void {
  document.body.innerHTML = `
    <button id="cfg-sound" type="button"></button>
    <button id="cfg-lang" type="button"><span>EN</span></button>
  `
}

describe('entry-app splash reveal lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('cancels a pending readiness event, including zero-delay timers', () => {
    vi.useFakeTimers()
    const ready = vi.fn()
    const timer = createReadyEventTimer(ready)

    timer.schedule(0)
    timer.clear()
    vi.runAllTimers()

    expect(ready).not.toHaveBeenCalled()
  })

  it('replaces an earlier readiness event with the latest schedule', () => {
    vi.useFakeTimers()
    const ready = vi.fn()
    const timer = createReadyEventTimer(ready)

    timer.schedule(100)
    timer.schedule(25)
    vi.advanceTimersByTime(24)
    expect(ready).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)

    expect(ready).toHaveBeenCalledOnce()
  })

  it('replaces and clears the retry-owned bootstrap style', () => {
    const owner = createStyleOwner()

    owner.set('.first { color: red; }')
    const first = document.head.querySelectorAll('style')
    expect(first).toHaveLength(1)
    expect(first[0]?.textContent).toContain('color: red')

    owner.set('.second { color: blue; }')
    const second = document.head.querySelectorAll('style')
    expect(second).toHaveLength(1)
    expect(second[0]?.textContent).toContain('color: blue')

    owner.clear()
    expect(document.head.querySelectorAll('style')).toHaveLength(0)
  })

  it('writes the boot percent as a zero-padded value and flips INITIALIZING → READY at 100', () => {
    mountSplashMeta()

    updateLoaderProgress(15)
    const percent = document.querySelector('[data-jlz-splash="progress"]')
    const status = document.querySelector('[data-jlz-splash="state"]')
    expect(percent?.textContent).toBe('15%')
    expect(status?.textContent).toBe('INITIALIZING')

    updateLoaderProgress(40)
    expect(percent?.textContent).toBe('40%')
    expect(status?.textContent).toBe('INITIALIZING')

    updateLoaderProgress(100)
    expect(percent?.textContent).toBe('100%')
    expect(status?.textContent).toBe('READY')
  })

  it('clamps out-of-range boot progress into the 00–100 window', () => {
    mountSplashMeta()

    updateLoaderProgress(-10)
    expect(document.querySelector('[data-jlz-splash="progress"]')?.textContent).toBe('00%')
    expect(document.querySelector('[data-jlz-splash="state"]')?.textContent).toBe('INITIALIZING')

    updateLoaderProgress(140)
    expect(document.querySelector('[data-jlz-splash="progress"]')?.textContent).toBe('100%')
    expect(document.querySelector('[data-jlz-splash="state"]')?.textContent).toBe('READY')
  })

  it('leaves the document untouched when the splash meta row is absent', () => {
    document.body.innerHTML = '<main id="spa-content"></main>'

    expect(() => updateLoaderProgress(40)).not.toThrow()
  })

  // Regression: the bootstrap reset used to abort an AbortController BEFORE
  // the toggles registered their click listeners, and listeners added on an
  // already-aborted signal are dropped by the DOM spec — both splash toggles
  // were dead on every page load. The contract: after initSplashToggles(),
  // clicks must flip state immediately.
  it('wires working splash toggles (clicks flip state after init)', () => {
    mountSplashToggles()
    localStorage.removeItem('jlz:sound')
    localStorage.removeItem('jlz:lang')

    // Sound: starts unmuted (explicit stored preference), click mutes.
    localStorage.setItem('jlz:sound', 'on')
    initSplashToggles()

    const sound = document.getElementById('cfg-sound') as HTMLButtonElement
    const lang = document.getElementById('cfg-lang') as HTMLButtonElement

    expect(sound.getAttribute('aria-pressed')).toBe('true')
    sound.click()
    expect(sound.getAttribute('aria-pressed')).toBe('false')
    expect(sound.classList.contains('is-off')).toBe(true)
    expect(localStorage.getItem('jlz:sound')).toBe('off')
    sound.click()
    expect(sound.getAttribute('aria-pressed')).toBe('true')
    expect(sound.classList.contains('is-off')).toBe(false)

    // Language: starts EN, click switches to RU and persists.
    expect(lang.querySelector('span')?.textContent).toBe('EN')
    lang.click()
    expect(lang.querySelector('span')?.textContent).toBe('RU')
    expect(lang.getAttribute('aria-pressed')).toBe('true')
    expect(localStorage.getItem('jlz:lang')).toBe('RU')

    // Re-running bootstrap wiring on the same shell must not add a second
    // listener whose closure toggles the state back immediately.
    initSplashToggles()
    lang.click()
    expect(lang.querySelector('span')?.textContent).toBe('EN')
    expect(localStorage.getItem('jlz:lang')).toBe('EN')
  })

  it('ignores incomplete language-toggle markup', () => {
    document.body.innerHTML = '<button id="cfg-lang" type="button"></button>'
    expect(() => initSplashToggles()).not.toThrow()
  })

  it('tolerates a missing splash toggle without throwing', () => {
    document.body.innerHTML = '<main id="spa-content"></main>'

    expect(() => initSplashToggles()).not.toThrow()
  })
})
