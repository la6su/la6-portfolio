import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { worldSlotIndex } from '../../../src/core/worldSlots'
import { CinematicNav } from '../../../src/UI/CinematicNav'

const FIRST_MAIN = worldSlotIndex('intro')!
const liveNavs: CinematicNav[] = []

function mountStoryTrack(): { track: HTMLElement; panel: HTMLElement; heading: HTMLElement } {
  document.body.innerHTML = `
    <main id="spa-content">
      <section data-section="intro">
        <h2>Intro</h2>
        <div class="jlz-story-panel"></div>
      </section>
      <section data-section="works"><h2>Works</h2></section>
      <section data-section="services"><h2>Services</h2></section>
      <section data-section="contact"><h2>Contact</h2></section>
      <section data-section="menu"><h2>Menu</h2></section>
    </main>
  `
  const track = document.querySelector<HTMLElement>('#spa-content')!
  const panel = track.querySelector<HTMLElement>('.jlz-story-panel')!
  const heading = track.querySelector<HTMLElement>('[data-section="works"] h2')!
  // jsdom has no layout engine: give the self-scrolling panel a real range.
  panel.style.overflowY = 'auto'
  Object.defineProperty(panel, 'clientHeight', { value: 200, configurable: true })
  Object.defineProperty(panel, 'scrollHeight', { value: 480, configurable: true })
  track.scrollTo = vi.fn() as unknown as typeof track.scrollTo
  return { track, panel, heading }
}

function pressKey(target: HTMLElement, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

function createNav(page: () => 'home' | 'works'): CinematicNav {
  const nav = new CinematicNav(page)
  liveNavs.push(nav)
  return nav
}

describe('CinematicNav keyboard policy', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    document.body.classList.remove('jlz-media-layer-open')
  })

  // A leaked window keydown listener would answer the next test's key press.
  afterEach(() => {
    for (const nav of liveNavs.splice(0)) nav.dispose()
  })

  it('leaves native keyboard scrolling to a section that scrolls on its own', () => {
    const { panel } = mountStoryTrack()
    const nav = createNav(() => 'home')

    const event = pressKey(panel, 'ArrowDown')

    expect(event.defaultPrevented).toBe(false)
    expect(nav.getSectionIndex()).toBe(FIRST_MAIN)
  })

  it('drives the story track from a target that cannot scroll', () => {
    const { heading } = mountStoryTrack()
    const nav = createNav(() => 'home')

    const event = pressKey(heading, 'ArrowDown')

    expect(event.defaultPrevented).toBe(true)
    expect(nav.getSectionIndex()).toBe(FIRST_MAIN + 1)
  })

  it('leaves modified keys to the browser', () => {
    const { heading } = mountStoryTrack()
    const nav = createNav(() => 'home')

    const event = pressKey(heading, 'ArrowDown', { ctrlKey: true })

    expect(event.defaultPrevented).toBe(false)
    expect(nav.getSectionIndex()).toBe(FIRST_MAIN)
  })

  it('stays out of the way while a media layer owns the keyboard', () => {
    const { heading } = mountStoryTrack()
    const nav = createNav(() => 'home')
    document.body.classList.add('jlz-media-layer-open')

    const event = pressKey(heading, 'ArrowDown')

    expect(event.defaultPrevented).toBe(false)
    expect(nav.getSectionIndex()).toBe(FIRST_MAIN)
  })

  it('claims nothing when the route has no story track bound', () => {
    // A content route without its `.jlz-page` scroller leaves _track null.
    document.body.innerHTML = '<main id="spa-content"></main>'
    createNav(() => 'works')

    const event = pressKey(document.body, 'ArrowDown')

    expect(event.defaultPrevented).toBe(false)
  })
})
