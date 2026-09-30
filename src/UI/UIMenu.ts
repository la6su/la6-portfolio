// UIMenu.ts — persistent cinematic shell.
//
// The top bar exposes the full-screen/compact responsive Menu and the existing
// preference controls. A separate lower launcher opens the 3D Contact finale.
// CinematicNav owns story position and the panel section state.

import UIkit from 'uikit'
import { toggleLang, getLang, t } from '../core/i18n'
import { themeManager } from '../core/ThemeManager'
import { getSoundMuted, setSoundMutedPreference } from '../core/SfxSystem'
import { eventBus } from '../core/EventBus'

// Theme icons are registered in console-icons.ts as polarity scope glyphs.
// The toggle shows the active glyph through CSS; no text or DOM state is used
// by the scene.

export class UIMenu {
  private navEl: HTMLElement
  private _langBtn: HTMLButtonElement | null = null
  private _themeBtn: HTMLButtonElement | null = null
  private _soundBtn: HTMLButtonElement | null = null
  private readonly _unsubs: Array<() => void> = []
  private _soundMuted = getSoundMuted()
  private _menuBtn: HTMLButtonElement | null = null
  private _contactBtn: HTMLButtonElement | null = null
  private _navigate: ((index: number) => void) | null = null
  private _fullscreenOpen = false
  private readonly _clickHandler = (event: MouseEvent): void => {
    const target = event.target as Element | null
    if (target?.closest('#jlz-lang-toggle')) {
      toggleLang()
    } else if (target?.closest('#jlz-theme-toggle')) {
      themeManager.toggle()
    } else if (target?.closest('#jlz-sound-toggle')) {
      eventBus.emit('jlz:sound-toggle', { muted: !this._soundMuted })
    } else if (target?.closest('#jlz-menu-launcher')) {
      if (this._fullscreenOpen) eventBus.emit('jlz:close-media-layer')
      else this._navigate?.(5)
    } else if (target?.closest('#jlz-contact-launcher')) {
      this._navigate?.(0)
    }
  }

  constructor() {
    this.navEl = document.createElement('div')
    this.navEl.className = 'jlz-cinematic-shell uk-position-relative'
    this.navEl.innerHTML = `
      <header class="jlz-topbar uk-flex uk-flex-middle uk-flex-between">
        <a class="jlz-topbar__brand uk-flex uk-flex-inline uk-flex-middle uk-text-uppercase uk-text-decoration-none" href="/" aria-label="JUSTLOVEJAZZ — Studio">
          <img class="jlz-brand-mark" src="/logo.svg" width="30" height="30" alt="" aria-hidden="true">
          <span class="jlz-topbar__wordmark">JUSTLOVEJAZZ</span>
          <span class="jlz-topbar__mode" aria-hidden="true">WORLD / 01</span>
        </a>
        <div class="jlz-topbar-controls uk-flex uk-flex-middle">
          <button class="uk-icon-button jlz-lang-toggle" type="button" id="jlz-lang-toggle"
                  aria-label="Switch language" aria-pressed="false" title="Language"
                  uk-tooltip="pos: bottom; delay: 200">
            <span class="jlz-lang-label uk-text-uppercase uk-text-bold">EN</span>
          </button>
          <button class="uk-icon-button jlz-theme-toggle" type="button" id="jlz-theme-toggle"
                  aria-label="Toggle inverse theme" aria-pressed="false" title="Theme: auto"
                  uk-tooltip="pos: bottom; delay: 200">
            <span uk-icon="icon: theme-auto" aria-hidden="true"></span>
            <span uk-icon="icon: theme-inverse" aria-hidden="true"></span>
          </button>
          <button class="uk-icon-button jlz-sound-toggle" type="button" id="jlz-sound-toggle"
                  aria-label="Toggle sound" aria-pressed="true" title="Sound: off"
                  uk-tooltip="pos: bottom; delay: 200">
            <span uk-icon="icon: muted" aria-hidden="true"></span>
          </button>
          <button class="uk-button uk-button-default uk-flex uk-flex-middle jlz-menu-launcher" type="button" id="jlz-menu-launcher"
                  aria-controls="section-menu" aria-expanded="false">
            <span class="jlz-menu-launcher__label" data-i18n="menu.navigate">Menu</span>
            <span class="jlz-menu-launcher__glyph" aria-hidden="true"><i></i><i></i></span>
          </button>
        </div>
      </header>
      <div class="jlz-console-bar">
        <span class="jlz-console-bar__signal" aria-hidden="true"></span>
        <div class="jlz-contact-launcher">
          <button class="uk-button uk-button-default uk-flex uk-flex-middle jlz-contact-launcher__button" type="button"
                  id="jlz-contact-launcher" aria-controls="section-lab" aria-expanded="false">
            <span class="jlz-contact-launcher__channel" aria-hidden="true">
              <svg viewBox="0 0 16 16" width="16" height="16" focusable="false">
                <path d="M2 3h10v8H2ZM5 13v2M9 13v2M5 6h4M5 8.5h2" />
              </svg>
            </span>
            <span data-i18n="story.contact">Contact</span>
            <span class="jlz-contact-launcher__arrow" uk-icon="icon: arrow-up; ratio: 0.8" aria-hidden="true"></span>
          </button>
        </div>
        <!-- Storyline (section dots) is injected here by CinematicNav -->
      </div>
    `

    const app = document.getElementById('app') ?? document.body
    app.appendChild(this.navEl)
    // The persistent shell is outside every route root. Hydrate its icons and
    // tooltip once at the owner boundary instead of relying on a later global
    // `UIkit.update(#spa-content)` pass from the bootstrap.
    ;(UIkit as unknown as { update(element: Element): void }).update(this.navEl)

    this._langBtn = this.navEl.querySelector<HTMLButtonElement>('#jlz-lang-toggle')
    this._themeBtn = this.navEl.querySelector<HTMLButtonElement>('#jlz-theme-toggle')
    this._soundBtn = this.navEl.querySelector<HTMLButtonElement>('#jlz-sound-toggle')
    this._menuBtn = this.navEl.querySelector<HTMLButtonElement>('#jlz-menu-launcher')
    this._contactBtn = this.navEl.querySelector<HTMLButtonElement>('#jlz-contact-launcher')

    // One delegated handler keeps the persistent shell's DOM listener surface
    // small and gives dispose() one exact owner to remove.
    this.navEl.addEventListener('click', this._clickHandler)

    // Wire global listeners (typed eventBus ports — the raw window bridge was
    // removed in Phase 10).
    this._unsubs.push(eventBus.on('jlz:lang-change', () => this.updateLangLabel()))

    this._unsubs.push(eventBus.on('jlz:theme-change', () => this._syncThemeButton()))

    // D-6 fix: single handler for jlz:sound-toggle — does ALL the work
    // (state + localStorage + button sync). Both the click handler above
    // and external triggers (if any) route through this one path.
    this._unsubs.push(
      eventBus.on('jlz:sound-toggle', ({ muted }) => {
        this._soundMuted = muted
        setSoundMutedPreference(this._soundMuted)
        this._syncSoundButton()
      }),
    )
    this._unsubs.push(
      eventBus.on('jlz:fullscreen-change', ({ open }) => {
        this._setFullscreenOpen(open)
      }),
    )

    // Initialize button states
    this.updateLangLabel()
    this._syncThemeButton()
    this._syncSoundButton()
  }

  private _syncThemeButton(): void {
    if (!this._themeBtn) return
    const isInverse = themeManager.isInverse
    this._themeBtn.setAttribute('aria-pressed', String(isInverse))
    this._themeBtn.title = isInverse ? 'Theme: inverse' : 'Theme: auto'
    this._themeBtn.classList.toggle('is-inverse', isInverse)
  }

  private _syncSoundButton(): void {
    if (!this._soundBtn) return
    const muted = this._soundMuted
    this._soundBtn.setAttribute('aria-pressed', String(!muted))
    this._soundBtn.title = muted ? 'Sound: off' : 'Sound: on'
    this._soundBtn.classList.toggle('is-muted', muted)
    // Swap icon: muted → sound (speaker with waves)
    const iconSpan = this._soundBtn.querySelector('[uk-icon]')
    if (iconSpan) {
      iconSpan.setAttribute('uk-icon', `icon: ${muted ? 'muted' : 'sound'}`)
      ;(UIkit as unknown as { update(element: Element): void }).update(iconSpan)
    }
  }

  /**
   * Fullscreen media keeps one persistent exit in the top bar. Every other
   * shell control becomes inert, so its fixed chrome cannot overlap the media
   * owner or receive focus behind it.
   */
  private _setFullscreenOpen(open: boolean): void {
    this._fullscreenOpen = open
    this.navEl.classList.toggle('is-fullscreen-open', open)
    const hiddenControls = this.navEl.querySelectorAll<HTMLElement>(
      '.jlz-topbar__brand, #jlz-lang-toggle, #jlz-theme-toggle, #jlz-sound-toggle, .jlz-console-bar',
    )
    for (const control of hiddenControls) {
      control.setAttribute('aria-hidden', String(open))
      ;(control as HTMLElement & { inert: boolean }).inert = open
    }
    const label = this._menuBtn?.querySelector<HTMLElement>('.jlz-menu-launcher__label')
    if (label) label.textContent = t(open ? 'common.close' : 'menu.navigate')
    this._menuBtn?.setAttribute('aria-label', t(open ? 'common.close' : 'menu.navigate'))
    this._menuBtn?.setAttribute('aria-expanded', 'false')
  }

  onNavigate(callback: (index: number) => void): void {
    this._navigate = callback
  }

  setActive(index: number): void {
    this._menuBtn?.setAttribute('aria-expanded', String(index === 5))
    this._contactBtn?.setAttribute('aria-expanded', String(index === 0))
    if (this._contactBtn) this._contactBtn.tabIndex = index === 0 || index === 5 ? -1 : 0
    this.navEl.classList.toggle('is-menu-open', index === 5)
    this.navEl.classList.toggle('is-contact-open', index === 0)
    const mode = this.navEl.querySelector<HTMLElement>('.jlz-topbar__mode')
    if (mode) mode.textContent = `WORLD / ${String(index + 1).padStart(2, '0')}`
  }

  private updateLangLabel(): void {
    const lang = getLang()
    const label = this._langBtn?.querySelector('.jlz-lang-label')
    if (label) label.textContent = lang
    // aria-pressed: true when RU (the alternate language) is active.
    this._langBtn?.setAttribute('aria-pressed', String(lang === 'RU'))
    this._langBtn?.setAttribute('aria-label', `Switch language, current: ${lang}`)
  }

  dispose(): void {
    this.navEl.removeEventListener('click', this._clickHandler)
    for (const unsub of this._unsubs) unsub()
    this._unsubs.length = 0
    this._navigate = null
    this.navEl.remove()
  }
}
