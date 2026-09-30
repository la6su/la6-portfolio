import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CinematicNav } from '../UI/CinematicNav'
import { eventBus } from '../core/EventBus'
import type { PageId } from '../core/routeManifest'

const MAIN_HEIGHT = 1000
function createNav(): CinematicNav {
  return new CinematicNav(6, () => (document.body.dataset.page ?? 'home') as PageId)
}

function createStoryTrack(page: 'home' | 'works' = 'home'): HTMLElement {
  document.body.dataset.page = page
  const spa = document.createElement('main')
  spa.id = 'spa-content'

  const track = page === 'home' ? spa : document.createElement('div')
  if (page !== 'home') {
    track.className = 'jlz-page'
    spa.appendChild(track)
  }

  const ids =
    page === 'home'
      ? ['lab', 'intro', 'about', 'works', 'contact', 'menu']
      : ['page-lab', 'page-intro', 'page-about', 'page-works', 'page-contact', 'page-menu']

  ids.forEach((id, index) => {
    const section = document.createElement('section')
    if (page === 'home') section.dataset.section = id
    else section.dataset.pageSection = id
    section.id = `section-${id.replace('page-', '')}`
    if (index > 0 && index < 5) {
      const title = document.createElement('h2')
      title.textContent = id.replace('page-', '')
      section.appendChild(title)
    }
    track.appendChild(section)
  })

  Object.defineProperty(track, 'clientHeight', { configurable: true, value: MAIN_HEIGHT })
  track.scrollTo = ((options: ScrollToOptions) => {
    track.scrollTop = options.top ?? track.scrollTop
    track.dispatchEvent(new Event('scroll'))
  }) as typeof track.scrollTo

  document.body.appendChild(spa)
  return track
}

describe('CinematicNav — vertical story and sheets', () => {
  let nav: CinematicNav | null = null

  beforeEach(() => {
    createStoryTrack()
  })

  afterEach(() => {
    nav?.dispose()
    nav = null
    document.getElementById('spa-content')?.remove()
    delete document.body.dataset.page
    delete document.body.dataset.cinematicSheet
  })

  it('maps the four public story chapters to native vertical positions', () => {
    const track = document.getElementById('spa-content')!
    nav = createNav()

    nav.goToSection(3)

    expect(nav.getSectionIndex()).toBe(3)
    expect(track.scrollTop).toBe(MAIN_HEIGHT * 2)
    expect(track.querySelector('[data-section="works"]')?.getAttribute('data-story-state')).toBe(
      'active',
    )
  })

  it('reports continuous normalized progress between story chapters', () => {
    const track = document.getElementById('spa-content')!
    nav = createNav()
    track.scrollTop = MAIN_HEIGHT * 1.5

    expect(nav.getOverallProgress()).toBeCloseTo(0.5, 5)
  })

  it('removes decorative story parallax when reduced motion is enabled', () => {
    const track = document.getElementById('spa-content')!
    nav = createNav()
    track.scrollTop = MAIN_HEIGHT * 1.5

    nav.setReducedMotion(true)

    const section = track.querySelector<HTMLElement>('[data-section="about"]')!
    const panel = section.style.getPropertyValue('--jlz-story-shift-opposite')
    expect(section.style.getPropertyValue('--jlz-story-shift')).toBe('0vh')
    expect(panel).toBe('0vh')
    nav.setReducedMotion(false)
    expect(section.style.getPropertyValue('--jlz-story-shift')).not.toBe('0vh')
  })

  it('opens the desktop/mobile Menu sheet and returns to the previous chapter', () => {
    nav = createNav()
    const indices: number[] = []
    nav.onSectionChange((index) => indices.push(index))
    nav.goToSection(3)

    nav.goToSection(5)
    expect(nav.getSectionIndex()).toBe(5)
    expect(document.body.dataset.cinematicSheet).toBe('menu')
    expect(document.querySelector<HTMLElement>('[data-section="works"]')?.inert).toBe(true)

    eventBus.emit('jlz:close-nav')
    expect(nav.getSectionIndex()).toBe(3)
    expect(document.body.dataset.cinematicSheet).toBeUndefined()
    expect(document.querySelector<HTMLElement>('[data-section="works"]')?.inert).toBe(false)
    expect(indices.slice(-2)).toEqual([5, 3])
  })

  it('opens the Contact footer in the legacy runtime slot and closes explicitly', () => {
    nav = createNav()
    nav.goToSection(4)

    nav.goToSection(0)
    expect(nav.getSectionIndex()).toBe(0)
    expect(document.body.dataset.cinematicSheet).toBe('footer')

    eventBus.emit('jlz:close-nav')
    expect(nav.getSectionIndex()).toBe(4)
    expect(document.body.dataset.cinematicSheet).toBeUndefined()
  })

  it('resolves legacy hashes to the public Contact finale without exposing Lab', () => {
    nav = createNav()

    nav.goToSectionByHash('#section-lab')

    expect(nav.getSectionIndex()).toBe(0)
    expect(document.body.dataset.cinematicSheet).toBe('footer')
  })

  it('resolves hashes against the active track when a detached duplicate exists', () => {
    const detached = document.createElement('section')
    detached.id = 'section-works'
    document.body.prepend(detached)
    nav = createNav()

    nav.goToSectionByHash('#section-works')

    expect(nav.getSectionIndex()).toBe(3)
    detached.remove()
  })

  it('uses the injected page getter when the DOM dataset disagrees', () => {
    document.body.dataset.page = 'works'
    nav = new CinematicNav(6, () => 'home')

    nav.goToSection(3)

    expect(document.querySelector('[data-section="works"]')).toBeTruthy()
    expect(document.querySelector('[data-page-section="page-works"]')).toBeNull()
  })

  it('unsubscribes its route listener on destroy', () => {
    const bindSpy = vi.spyOn(
      CinematicNav.prototype as unknown as { _bindTrack: () => void },
      '_bindTrack',
    )
    nav = createNav()
    bindSpy.mockClear()

    nav.dispose()
    eventBus.emit('jlz:route-change', { page: 'works' })

    expect(bindSpy).not.toHaveBeenCalled()
    bindSpy.mockRestore()
  })

  it('removes button listeners on destroy', () => {
    nav = createNav()
    const button = nav.el.querySelector<HTMLButtonElement>('[data-story-index="3"]')!
    const goToSection = vi.spyOn(nav, 'goToSection')

    nav.dispose()
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(goToSection).not.toHaveBeenCalled()
  })

  it('cancels pending scroll frames when the route track is rebound', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(42)
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
    nav = createNav()
    const track = document.getElementById('spa-content')!

    track.dispatchEvent(new Event('scroll'))
    eventBus.emit('jlz:route-change', { page: 'works' })

    expect(cancel).toHaveBeenCalledWith(42)
    raf.mockRestore()
    cancel.mockRestore()
  })

  it('does not reapply side state on settled center scroll frames', async () => {
    const track = document.getElementById('spa-content')!
    nav = createNav()
    const applySideState = vi.spyOn(
      nav as unknown as { _applySideState: () => void },
      '_applySideState',
    )
    applySideState.mockClear()

    track.dispatchEvent(new Event('scroll'))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    expect(applySideState).not.toHaveBeenCalled()
    expect(document.body.dataset.cinematicSheet).toBeUndefined()
  })

  it('reapplies side state once when scrolling closes a sheet', async () => {
    const track = document.getElementById('spa-content')!
    nav = createNav()
    nav.goToSection(5)
    const applySideState = vi.spyOn(
      nav as unknown as { _applySideState: () => void },
      '_applySideState',
    )
    applySideState.mockClear()

    track.scrollTop = MAIN_HEIGHT
    track.dispatchEvent(new Event('scroll'))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    expect(applySideState).toHaveBeenCalledTimes(1)
    expect(document.body.dataset.cinematicSheet).toBeUndefined()
    expect(document.querySelector<HTMLElement>('[data-section="works"]')?.inert).toBe(false)
  })
})

describe('CinematicNav — content page track', () => {
  let nav: CinematicNav | null = null

  beforeEach(() => {
    createStoryTrack('works')
  })

  afterEach(() => {
    nav?.dispose()
    nav = null
    document.getElementById('spa-content')?.remove()
    delete document.body.dataset.page
    delete document.body.dataset.cinematicSheet
  })

  it('preserves the active chapter when a compact Menu sheet is closed', () => {
    nav = createNav()
    nav.goToSection(2)
    nav.goToSection(5)

    eventBus.emit('jlz:close-nav')

    expect(nav.getSectionIndex()).toBe(2)
    expect(document.body.dataset.cinematicSheet).toBeUndefined()
  })

  it('deduplicates page-section events without an optional callback', () => {
    nav = createNav()
    const indices: number[] = []
    const unsubscribe = eventBus.on('jlz:page-section-change', ({ index }) => indices.push(index))

    nav.goToSection(2)
    nav.goToSection(2)
    nav.goToSection(3)

    expect(indices).toEqual([2, 3])
    unsubscribe()
  })
})
