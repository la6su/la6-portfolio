// src/Experience/ContentReveal.ts
// Section sync: applies the per-section theme; Vue owns the active class.
//
// PER-SECTION THEME (KISS):
//   Each section's PhaseConfig has theme: 'light' | 'dark' in WorldConfig.
//   On section change, toggle uk-light on <html> + <body>:
//     auto:    light → uk-light, dark → no uk-light
//     inverse: FLIPPED — light → no uk-light, dark → uk-light
//   The effective polarity follows the section preset and user's theme mode;
//   the event synchronizes that result with the scene.

import { eventBus } from '../core/EventBus'
import { contentRoot } from '../core/contentRoot'
import type { PageId } from '../core/routeManifest'
import { themeManager } from '../core/ThemeManager'
import { getWorldConfigForPage, type PhaseConfig } from '../core/WorldConfig'
import { worldSlotIndex } from '../core/worldSlots'

const FIRST_CONTENT_SLOT = worldSlotIndex('intro')!
const CONTACT_FOOTER_SLOT = worldSlotIndex('lab')!
const MENU_SLOT = worldSlotIndex('menu')!

export class ContentReveal {
  /** Latest resolved theme, including initial resolution before listeners attach. */
  public isLight = false
  private sectionUnsub: (() => void) | null = null
  private pageSectionUnsub: (() => void) | null = null
  private themeChangeUnsub: (() => void) | null = null
  private routeChangeUnsub: (() => void) | null = null
  private cachedConfigs: readonly PhaseConfig[] | null = null
  private page: () => PageId
  private _destroyed = false
  private readonly _initialHtmlLight: boolean
  private readonly _initialBodyLight: boolean

  constructor(page: () => PageId) {
    this.page = page
    this._initialHtmlLight = document.documentElement.classList.contains('uk-light')
    this._initialBodyLight = document.body.classList.contains('uk-light')
    this.setupSectionSync()
    this.setupThemeSync()
    // Apply theme for the already-active section on init. The Vue route mount
    // (useJlzPage.postRender → jlz:route-change) runs BEFORE Experience.init()
    // creates this ContentReveal, so the route-change listener above misses
    // the initial render. Without this, uk-light from index.html's default
    // stays on <body> until the first section nav → wrong theme on boot
    // (especially visible when inverse mode is persisted in localStorage).
    this.applyInitialTheme()
  }

  private applyInitialTheme(): void {
    this.applyTheme(this.activeSectionId())
  }

  private getConfigs(): readonly PhaseConfig[] {
    if (!this.cachedConfigs) {
      const pageKey = this.page()
      this.cachedConfigs = getWorldConfigForPage(pageKey)
    }
    return this.cachedConfigs
  }

  private activeSectionId(): string {
    const active = contentRoot().querySelector<HTMLElement>(
      '[data-section].section-active, [data-page-section].section-active',
    )
    return (
      active?.getAttribute('data-section') ?? active?.getAttribute('data-page-section') ?? 'intro'
    )
  }

  /**
   * Content-page world configs use the shared six-slot order, while their
   * semantic sections have route-specific IDs. Resolve the active DOM
   * section back to its content index; slot 0 belongs to the Contact footer.
   */
  private activeContentSectionIndex(): number {
    const root = contentRoot()
    const mainSections = [
      ...root.querySelectorAll<HTMLElement>('.jlz-page > section[data-page-section]'),
    ].filter((section) => {
      const id = section.dataset.pageSection
      return id !== 'page-lab' && id !== 'page-menu'
    })
    return mainSections.findIndex((section) => section.classList.contains('section-active'))
  }

  private setupSectionSync() {
    // Home: jlz:section-change (data-section)
    this.sectionUnsub = eventBus.on('jlz:section-change', (payload) => {
      if (!payload?.sectionId) return
      this.applyTheme(payload.sectionId)
    })

    // Content pages: jlz:page-section-change (data-page-section)
    this.pageSectionUnsub = eventBus.on('jlz:page-section-change', ({ worldIndex, sectionId }) => {
      this.applyTheme(sectionId, false, worldIndex)
    })
  }

  private applyTheme(sectionId: string, snap = false, worldIndexHint = -1): void {
    const configs = this.getConfigs()
    // CinematicNav reports canonical world slots (1–4); its index already
    // matches the config array. Initial DOM lookup is local and needs offset.
    let contentConfigIndex = worldIndexHint
    if (contentConfigIndex < 0 && this.page() !== 'home') {
      const localIndex = this.activeContentSectionIndex()
      if (localIndex >= 0) contentConfigIndex = localIndex + FIRST_CONTENT_SLOT
      else if (sectionId === 'page-lab') contentConfigIndex = CONTACT_FOOTER_SLOT
      else if (sectionId === 'page-menu') contentConfigIndex = MENU_SLOT
    }
    const contentConfig = contentConfigIndex >= 0 ? configs[contentConfigIndex] : undefined
    const cfg =
      configs.find((c) => c.domSection === sectionId || c.id === sectionId) ?? contentConfig
    // Config identity is canonical when present. Keep the nav index only for
    // a semantic fallback section without a world-config entry.
    const sectionIndex = cfg ? configs.indexOf(cfg) : worldIndexHint
    const sectionIsLight = cfg ? cfg.theme === 'light' : true
    const isInverse = themeManager.isInverse
    const shouldUseLight = isInverse ? !sectionIsLight : sectionIsLight
    this.isLight = shouldUseLight

    document.documentElement.classList.toggle('uk-light', shouldUseLight)
    document.body.classList.toggle('uk-light', shouldUseLight)

    // Each section can have a distinct scene tone even when polarity matches,
    // so synchronize the scene on every section or theme change.
    const detail = {
      isLight: shouldUseLight,
      sectionIndex,
      snap,
    }
    eventBus.emit('jlz:theme-applied', detail)
  }

  private setupThemeSync() {
    // Invalidate route-specific configs and apply the new active section's
    // theme as soon as its DOM is available.
    this.routeChangeUnsub = eventBus.on('jlz:route-change', () => {
      this.cachedConfigs = null
      this.applyTheme(this.activeSectionId())
    })

    // Vue's active class is the source for the section under the current
    // theme. The DOM fallback covers the instant before the first route render.
    this.themeChangeUnsub = eventBus.on('jlz:theme-change', () => {
      // snap=true: theme toggle → EnvSphere must change instantly (no lerp)
      // to match the instant CSS uk-light flip.
      this.applyTheme(this.activeSectionId(), true)
    })
  }

  destroy() {
    if (this._destroyed) return
    this._destroyed = true
    this.sectionUnsub?.()
    this.sectionUnsub = null
    this.pageSectionUnsub?.()
    this.themeChangeUnsub?.()
    this.routeChangeUnsub?.()
    this.pageSectionUnsub = this.themeChangeUnsub = this.routeChangeUnsub = null
    document.documentElement.classList.toggle('uk-light', this._initialHtmlLight)
    document.body.classList.toggle('uk-light', this._initialBodyLight)
  }
}
