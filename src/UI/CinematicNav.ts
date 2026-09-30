// CinematicNav.ts — vertical, scroll-driven section navigation.
//
// The four main sections form one native vertical track. Trackpad, mouse-wheel
// and touch input retain their platform-native behavior. The canonical section-0 runtime slot now presents a
// Contact finale, while Menu remains section 5. Both open as bottom/top sheets
// without occupying a story frame.

import { prefersReducedMotion } from '../core/motionPolicy'
import type { PageId } from '../core/routeManifest'
import { worldSlotIndex, WORLD_SLOT_COUNT } from '../core/worldSlots'
import {
  clampStoryPosition,
  mainSectionFromPosition,
  storyProgressFromScroll,
  type StorySide,
} from '../core/storyState'
import { eventBus } from '../core/EventBus'

// Story slot indices are derived from the canonical six-slot model
// (worldSlots) instead of re-declared here — the slot model is the single
// source of truth for the index assignment. Slot 0 is the lab/Contact-finale
// slot, the four main story frames are slots 1..4, and the menu sheet is
// slot 5. These are canonical IDs, so the lookups are always defined.
const CONTACT_FOOTER_INDEX = worldSlotIndex('lab')!
const FIRST_MAIN = worldSlotIndex('intro')!
const LAST_MAIN = worldSlotIndex('contact')!
const MENU_INDEX = worldSlotIndex('menu')!
const MAIN_COUNT = LAST_MAIN - FIRST_MAIN + 1
const INTERACTION_SETTLE_MS = 220

// The side positions are the story-state contract's StorySide (single
// source of the 'center' | 'footer' | 'menu' set).
type SideState = StorySide

export class CinematicNav {
  public el: HTMLElement

  private _sectionCount: number
  private _page: () => PageId
  private _track: HTMLElement | null = null
  private _mainSections: HTMLElement[] = []
  private _mainSection = FIRST_MAIN
  private _side: SideState = 'center'
  private _onSectionChange: ((index: number) => void) | null = null
  private _onActiveChange: ((active: boolean) => void) | null = null
  private _isInteracting = false
  private _lastNotified = -1
  private _inactiveTimer: ReturnType<typeof setTimeout> | null = null
  private _scrollFrame: number | null = null
  private _focusFrame: number | null = null
  private _restoreFocus: HTMLElement | null = null
  private readonly _unsubs: Array<() => void> = []
  private _keydownHandler: ((event: KeyboardEvent) => void) | null = null
  private _scrollHandler: (() => void) | null = null
  private _sheetClickHandler: ((event: MouseEvent) => void) | null = null
  private _navButtons: HTMLButtonElement[] = []
  private _navButtonHandlers = new Map<HTMLButtonElement, () => void>()
  private _reducedMotion = prefersReducedMotion()

  /**
   * Loop-wake port (Phase 7). Native track scrolling is a renderer-loop wake
   * source: the rAF-throttled scroll sync reports activity so the single
   * driver can start the loop on a settled scene. Wired by Experience.
   */
  onActivity: (() => void) | null = null

  constructor(sectionCount: number, page: () => PageId) {
    this._page = page
    // The six-slot model is the worldSlots contract, not a literal.
    this._sectionCount = Math.max(WORLD_SLOT_COUNT, sectionCount)
    this.el = this._buildNavigator()
    this._addGlobalListeners()
    this._bindTrack()
  }

  private _buildNavigator(): HTMLElement {
    const nav = document.createElement('nav')
    nav.id = 'cinematic-nav'
    nav.className = 'jlz-storyline'
    nav.setAttribute('aria-label', 'Narrative sections')

    const items = document.createElement('div')
    items.className = 'jlz-storyline__items uk-flex uk-flex-middle'
    for (let index = FIRST_MAIN; index <= LAST_MAIN; index++) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'uk-button jlz-storyline__item'
      button.dataset.storyIndex = String(index)
      button.setAttribute('aria-label', `Go to section ${index}`)

      const number = document.createElement('span')
      number.className = 'jlz-storyline__number uk-text-meta uk-text-uppercase'
      number.textContent = String(index).padStart(2, '0')
      const label = document.createElement('span')
      label.className = 'jlz-storyline__label uk-hidden'
      label.dataset.storyLabel = ''
      label.textContent = `Section ${index}`
      button.append(number, label)
      const clickHandler = (): void => this.goToSection(index)
      button.addEventListener('click', clickHandler)
      this._navButtonHandlers.set(button, clickHandler)
      items.appendChild(button)
      this._navButtons.push(button)
    }

    const hint = document.createElement('span')
    hint.className = 'jlz-storyline__hint uk-hidden uk-text-meta uk-text-uppercase'
    hint.dataset.i18n = 'story.hint'
    hint.textContent = 'Scroll · swipe'

    nav.append(items, hint)
    return nav
  }

  private _addGlobalListeners(): void {
    this._unsubs.push(eventBus.on('jlz:route-change', () => this._bindTrack()))

    this._unsubs.push(eventBus.on('jlz:lang-change', () => this._refreshLabels()))

    this._unsubs.push(eventBus.on('jlz:close-nav', () => this._closeSide()))

    this._keydownHandler = (event: KeyboardEvent) => {
      if (document.querySelector('.uk-modal.uk-open')) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return

      if (event.key === 'Escape' && this._side !== 'center') {
        event.preventDefault()
        this._closeSide()
        return
      }
      if (event.key === 'ArrowDown' || event.key === 'PageDown') {
        event.preventDefault()
        this.goToDirection(1)
      } else if (event.key === 'ArrowUp' || event.key === 'PageUp') {
        event.preventDefault()
        this.goToDirection(-1)
      } else if (event.key === 'Home') {
        event.preventDefault()
        this.goToSection(FIRST_MAIN)
      } else if (event.key === 'End') {
        event.preventDefault()
        this.goToSection(LAST_MAIN)
      }
    }
    window.addEventListener('keydown', this._keydownHandler)

    // Capture the sheet close contract at its navigation owner. Templates also
    // dispatch jlz:close-nav for loose coupling, but UIkit can attach its own
    // close behavior after dynamic DOM initialization; capture keeps the exit
    // deterministic in both initialization orders.
    this._sheetClickHandler = (event: MouseEvent) => {
      const target = event.target as Element | null
      if (target?.closest('[data-close-cinematic-sheet]')) this._closeSide()
    }
    document.addEventListener('click', this._sheetClickHandler, true)
  }

  private _bindTrack(): void {
    this._cancelPendingFrames()
    this._removeTrackListeners()
    // Clear stale state from the previous page — _restoreFocus points to a
    // detached node after innerHTML replacement, and a pending _inactiveTimer
    // can falsely signal "user stopped interacting" on the new page (B-4).
    this._restoreFocus = null
    if (this._inactiveTimer) {
      clearTimeout(this._inactiveTimer)
      this._inactiveTimer = null
    }

    const pageMode = this._page() !== 'home'
    this._track = pageMode
      ? document.querySelector<HTMLElement>('#spa-content .jlz-page')
      : document.getElementById('spa-content')

    if (!this._track) return

    const selector = pageMode ? ':scope > [data-page-section]' : ':scope > [data-section]'
    this._mainSections = [...this._track.querySelectorAll<HTMLElement>(selector)].filter(
      (section) => {
        const id = section.dataset.section ?? section.dataset.pageSection ?? ''
        return id !== 'lab' && id !== 'menu' && id !== 'page-lab' && id !== 'page-menu'
      },
    )

    this._mainSection = FIRST_MAIN
    this._side = 'center'
    this._lastNotified = -1
    this._track.scrollTop = 0
    this._applySideState()

    this._scrollHandler = () => {
      if (this._scrollFrame !== null) return
      this._scrollFrame = requestAnimationFrame(() => {
        this._scrollFrame = null
        this._syncFromScroll()
        // Phase 7: native scroll is a loop wake source — report activity so a
        // settled single-driver loop can start advancing the scene.
        this.onActivity?.()
      })
    }

    this._track.addEventListener('scroll', this._scrollHandler, { passive: true })

    this._refreshLabels()
    this._updateStoryState(0)
    this._notifySection(FIRST_MAIN)
  }

  private _removeTrackListeners(): void {
    if (!this._track) return
    if (this._scrollHandler) this._track.removeEventListener('scroll', this._scrollHandler)
  }

  private _cancelPendingFrames(): void {
    if (this._scrollFrame !== null) {
      cancelAnimationFrame(this._scrollFrame)
      this._scrollFrame = null
    }
    if (this._focusFrame !== null) {
      cancelAnimationFrame(this._focusFrame)
      this._focusFrame = null
    }
  }

  private _syncFromScroll(): void {
    if (!this._track || this._mainSections.length === 0) return
    const height = Math.max(1, this._track.clientHeight || window.innerHeight)
    // The clamp + main-section rounding rule are the pure storyState
    // contract; the clamped position also feeds the per-section CSS vars.
    const position = clampStoryPosition(this._track.scrollTop / height, this._mainSections.length)
    const nextMain = mainSectionFromPosition(position, FIRST_MAIN, this._mainSections.length)

    const wasSide = this._side
    this._side = 'center'
    if (wasSide !== this._side) this._applySideState()
    this._mainSection = nextMain
    this._updateStoryState(position)
    this._notifySection(nextMain)
    this._setInteracting(true)
    this._queueInactive()
  }

  private _updateStoryState(position: number): void {
    const nearest = Math.round(position)
    this._mainSections.forEach((section, index) => {
      const state = index < nearest ? 'before' : index > nearest ? 'after' : 'active'
      const distance = Math.min(1, Math.abs(index - position))
      section.dataset.storyState = state
      section.style.setProperty('--jlz-story-distance', String(distance))
      section.style.setProperty(
        '--jlz-story-shift',
        this._reducedMotion ? '0vh' : `${(index - position) * 3}vh`,
      )
      section.style.setProperty(
        '--jlz-story-shift-opposite',
        this._reducedMotion ? '0vh' : `${(position - index) * 2.5}vh`,
      )
      section.style.setProperty('--jlz-story-title-opacity', String(1 - distance * 0.7))
      section.style.setProperty('--jlz-story-panel-opacity', String(1 - distance * 0.82))
    })

    this._navButtons.forEach((button, index) => {
      const active = index === nearest && this._side === 'center'
      button.classList.toggle('is-active', active)
      if (active) button.setAttribute('aria-current', 'step')
      else button.removeAttribute('aria-current')
    })
  }

  /** Settle decorative story parallax when the live motion policy changes. */
  setReducedMotion(reduced: boolean): void {
    if (this._reducedMotion === reduced) return
    this._reducedMotion = reduced
    this._updateStoryState(this._mainSection - FIRST_MAIN)
  }

  private _refreshLabels(): void {
    this._navButtons.forEach((button, index) => {
      const label =
        this._mainSections[index]?.querySelector('h1, h2')?.textContent?.trim() ||
        `Section ${index + 1}`
      const labelEl = button.querySelector<HTMLElement>('[data-story-label]')
      if (labelEl) labelEl.textContent = label
      button.setAttribute('aria-label', `Go to ${label}`)
    })
  }

  private _notifySection(index: number): void {
    if (index === this._lastNotified) return
    this._lastNotified = index
    this._onSectionChange?.(index)

    if (this._page() !== 'home') {
      eventBus.emit('jlz:page-section-change', { index, count: this._sectionCount })
    }
  }

  private _setInteracting(active: boolean): void {
    if (active === this._isInteracting) return
    this._isInteracting = active
    this._onActiveChange?.(active)
  }

  private _queueInactive(delay: number = INTERACTION_SETTLE_MS): void {
    if (this._inactiveTimer) clearTimeout(this._inactiveTimer)
    this._inactiveTimer = setTimeout(() => {
      this._setInteracting(false)
      this._inactiveTimer = null
    }, delay)
  }

  private _closeSide(): void {
    if (this._side === 'center') return
    if (this._focusFrame !== null) {
      cancelAnimationFrame(this._focusFrame)
      this._focusFrame = null
    }
    this._side = 'center'
    this._applySideState()
    this._updateStoryState(this._mainSection - FIRST_MAIN)
    this._notifySection(this._mainSection)
    this._setInteracting(true)
    this._queueInactive(650)
    this._restoreFocus?.focus({ preventScroll: true })
    this._restoreFocus = null
  }

  private _scrollToMain(index: number): void {
    if (!this._track) return
    const clamped = Math.max(FIRST_MAIN, Math.min(LAST_MAIN, index))
    const top = (clamped - FIRST_MAIN) * Math.max(1, this._track.clientHeight || window.innerHeight)
    const behavior: ScrollBehavior = this._reducedMotion ? 'auto' : 'smooth'
    if (typeof this._track.scrollTo === 'function') this._track.scrollTo({ top, behavior })
    else this._track.scrollTop = top
  }

  onSectionChange(callback: (index: number) => void): void {
    this._onSectionChange = callback
  }

  onActiveChange(callback: (active: boolean) => void): void {
    this._onActiveChange = callback
  }

  getSectionIndex(): number {
    if (this._side === 'footer') return CONTACT_FOOTER_INDEX
    if (this._side === 'menu') return MENU_INDEX
    return this._mainSection
  }

  /** Read-only story-side port for scene owners; the DOM dataset is only a UI projection. */
  getSide(): StorySide {
    return this._side
  }

  getOverallProgress(): number {
    if (this._side === 'footer') return 0
    if (this._side === 'menu') return 1
    if (!this._track)
      return storyProgressFromScroll(0, 1, MAIN_COUNT, FIRST_MAIN, this._sectionCount)
    // The main→slot progress rescale is the pure storyState contract.
    const height = this._track.clientHeight || window.innerHeight
    return storyProgressFromScroll(
      this._track.scrollTop,
      height,
      MAIN_COUNT,
      FIRST_MAIN,
      this._sectionCount,
    )
  }

  goToSection(index: number): void {
    const target = Math.max(CONTACT_FOOTER_INDEX, Math.min(MENU_INDEX, index))

    if (target === CONTACT_FOOTER_INDEX || target === MENU_INDEX) {
      const nextSide: SideState = target === CONTACT_FOOTER_INDEX ? 'footer' : 'menu'
      if (this._side === nextSide) {
        this._closeSide()
        return
      }
      if (this._side === 'center' && document.activeElement instanceof HTMLElement) {
        this._restoreFocus = document.activeElement
      }
      this._side = nextSide
      this._applySideState()
      this._notifySection(target)
      this._setInteracting(true)
      this._queueInactive(700)
      if (this._focusFrame !== null) cancelAnimationFrame(this._focusFrame)
      this._focusFrame = requestAnimationFrame(() => {
        this._focusFrame = null
        const selector = this._side === 'menu' ? '[data-cinematic-menu]' : '[data-contact-footer]'
        this._track
          ?.querySelector<HTMLElement>(`${selector} [data-close-cinematic-sheet]`)
          ?.focus({ preventScroll: true })
      })
      return
    }

    this._side = 'center'
    this._applySideState()
    this._mainSection = target
    this._notifySection(target)
    this._scrollToMain(target)
    this._updateStoryState(target - FIRST_MAIN)
    this._setInteracting(true)
    this._queueInactive(700)
  }

  goToDirection(direction: 1 | -1): void {
    if (this._side !== 'center') {
      this._closeSide()
      return
    }
    const next = Math.max(FIRST_MAIN, Math.min(LAST_MAIN, this._mainSection + direction))
    if (next !== this._mainSection) this.goToSection(next)
  }

  goToSectionByHash(hash: string): void {
    const targetId = hash.replace(/^#/, '')
    const target = this._track
      ? ([...this._track.querySelectorAll<HTMLElement>('[id]')].find(
          (candidate) => candidate.id === targetId,
        ) ?? null)
      : null
    if (!target) return

    const section = target.closest<HTMLElement>('[data-section], [data-page-section]') ?? target
    const id = section.dataset.section ?? section.dataset.pageSection ?? ''
    if (id === 'lab' || id === 'page-lab') {
      this.goToSection(CONTACT_FOOTER_INDEX)
      return
    }
    if (id === 'menu' || id === 'page-menu') {
      this.goToSection(MENU_INDEX)
      return
    }

    const index = this._mainSections.indexOf(section)
    if (index >= 0) this.goToSection(FIRST_MAIN + index)
  }

  isActive(): boolean {
    return this._isInteracting
  }

  private _applySideState(): void {
    this.el.dataset.sheet = this._side
    const sheetOpen = this._side !== 'center'
    this.el.inert = sheetOpen
    this._mainSections.forEach((section) => {
      section.inert = sheetOpen
    })

    const menu = this._track?.querySelector<HTMLElement>('[data-cinematic-menu]')
    const footer = this._track?.querySelector<HTMLElement>('[data-contact-footer]')
    menu?.setAttribute('aria-hidden', String(this._side !== 'menu'))
    footer?.setAttribute('aria-hidden', String(this._side !== 'footer'))

    if (this._side === 'center') delete document.body.dataset.cinematicSheet
    else document.body.dataset.cinematicSheet = this._side
  }

  update(): void {
    // Native scrolling owns position; the render loop reads progress only.
  }

  dispose(): void {
    this._removeTrackListeners()
    this._cancelPendingFrames()
    for (const unsub of this._unsubs) unsub()
    this._unsubs.length = 0
    if (this._keydownHandler) window.removeEventListener('keydown', this._keydownHandler)
    if (this._sheetClickHandler)
      document.removeEventListener('click', this._sheetClickHandler, true)
    this._navButtonHandlers.forEach((handler, button) => {
      button.removeEventListener('click', handler)
    })
    this._navButtonHandlers.clear()
    this._navButtons = []
    if (this._inactiveTimer) clearTimeout(this._inactiveTimer)
    this._mainSections.forEach((section) => {
      section.inert = false
    })
    delete document.body.dataset.cinematicSheet
    this.el.remove()
  }
}
