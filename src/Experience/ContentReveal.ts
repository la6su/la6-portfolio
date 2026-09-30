// src/Experience/ContentReveal.ts
// Section sync: toggles .section-active + applies per-section theme.
//
// PER-SECTION THEME (KISS):
//   Each section's PhaseConfig has theme: 'light' | 'dark' in WorldConfig.
//   On section change, toggle uk-light on <html> + <body>:
//     auto:    light → uk-light, dark → no uk-light
//     inverse: FLIPPED — light → no uk-light, dark → uk-light
//   The effective decision + the jlz:theme-applied detail shape are the
//   typed sectionTheme contract; EnvSphere syncs via that event.

import { eventBus, type AppEvents } from '../core/EventBus'
import type { PageId } from '../core/routeManifest'
import { themeManager, type ThemeMode } from '../core/ThemeManager'
import { getWorldConfigForPage, type PhaseConfig } from '../core/WorldConfig'
import { resolveEffectiveTheme, type ThemeAppliedPort } from '../core/sectionTheme'
import UIkit from 'uikit'

export class ContentReveal {
  /** Latest resolved theme, including initial resolution before listeners attach. */
  public isLight = false
  private sectionHandler: ((payload: AppEvents['jlz:section-change']) => void) | null = null
  private pageSectionUnsub: (() => void) | null = null
  private themeChangeUnsub: (() => void) | null = null
  private routeChangeUnsub: (() => void) | null = null
  private currentSectionId: string | null = null
  private currentSectionIndex: number = -1
  private cachedConfigs: readonly PhaseConfig[] | null = null
  private page: () => PageId
  private _uiKitUpdateFrame: number | null = null
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
    const active = this.contentRoot().querySelector<HTMLElement>(
      '[data-section].section-active, [data-page-section].section-active',
    )
    const sectionId =
      active?.getAttribute('data-section') ?? active?.getAttribute('data-page-section') ?? 'intro'
    this.currentSectionId = sectionId
    this.applyTheme(sectionId)
  }

  private getConfigs(): readonly PhaseConfig[] {
    if (!this.cachedConfigs) {
      const pageKey = this.page()
      this.cachedConfigs = getWorldConfigForPage(pageKey)
    }
    return this.cachedConfigs
  }

  private contentRoot(): ParentNode {
    // The active Vue route owns the semantic story root. Keep a document
    // fallback only for the short pre-mount bootstrap window.
    return document.getElementById('spa-content') ?? document
  }

  private setupSectionSync() {
    // Home: jlz:section-change (data-section)
    this.sectionHandler = (payload) => {
      if (!payload?.sectionId) return
      const matching = this.contentRoot().querySelector<HTMLElement>(
        `[data-section="${payload.sectionId}"]`,
      )
      if (!matching) return
      this.currentSectionId = payload.sectionId
      // Derive the 6-section index from the sectionId so EnvSphere can show
      // the active section's own colour on every scroll step.
      const configs = this.getConfigs()
      const idx = configs.findIndex(
        (c) => c.domSection === payload.sectionId || c.id === payload.sectionId,
      )
      this.currentSectionIndex = idx >= 0 ? idx : -1
      this.activateSection(`[data-section="${payload.sectionId}"]`)
    }
    eventBus.on('jlz:section-change', this.sectionHandler)

    // Content pages: jlz:page-section-change (data-page-section)
    this.pageSectionUnsub = eventBus.on('jlz:page-section-change', ({ index }) => {
      const sections = this.contentRoot().querySelectorAll<HTMLElement>('[data-page-section]')
      const el = sections[index]
      if (el) {
        const id = el.getAttribute('data-page-section') ?? ''
        this.currentSectionId = id
        this.currentSectionIndex = index
        this.activateSection(`[data-page-section="${id}"]`)
      }
    })
  }

  private activateSection(selector: string): void {
    const root = this.contentRoot()
    const matching = root.querySelector<HTMLElement>(selector)
    if (!matching) return

    root.querySelectorAll<HTMLElement>('[data-section], [data-page-section]').forEach((el) => {
      el.classList.remove('section-active')
    })
    matching.classList.add('section-active')
    this.applyTheme(this.currentSectionId ?? '')
    if (this._uiKitUpdateFrame !== null) cancelAnimationFrame(this._uiKitUpdateFrame)
    this._uiKitUpdateFrame = requestAnimationFrame(() => {
      this._uiKitUpdateFrame = null
      if (this._destroyed || !matching.isConnected) return
      try {
        ;(UIkit as unknown as { update(element: Element): void }).update(matching)
      } catch {
        /* not ready */
      }
    })
  }

  private applyTheme(sectionId: string, snap = false): void {
    const configs = this.getConfigs()
    let cfg = configs.find((c) => c.domSection === sectionId || c.id === sectionId)
    if (!cfg && this.currentSectionIndex >= 0) {
      cfg = configs[this.currentSectionIndex]
    }
    // Resolve the section index from the config so EnvSphere/3D sync gets
    // the correct per-section colour even on route-change (where
    // currentSectionIndex was just reset to -1).
    if (cfg) {
      const idx = configs.indexOf(cfg)
      if (idx >= 0) this.currentSectionIndex = idx
    }
    const sectionIsLight = cfg?.theme === 'light'
    const isInverse = themeManager.isInverse
    // Effective-theme port: the auto/inverse decision is the pure
    // sectionTheme contract (single source of the rule), and the event
    // detail below is built as the typed ThemeAppliedPort the scene reads.
    const mode: ThemeMode = isInverse ? 'inverse' : 'auto'
    const shouldUseLight = resolveEffectiveTheme(sectionIsLight, mode)
    this.isLight = shouldUseLight

    document.documentElement.classList.toggle('uk-light', shouldUseLight)
    document.body.classList.toggle('uk-light', shouldUseLight)

    // Always dispatch so EnvSphere can show the active section's own tone —
    // each section has a distinct colour, so even same-polarity scroll steps
    // must update the background. `themeChanged` lets consumers skip
    // theme-only work (ground, particles) when just the section moved.
    // We always send themeChanged=true so the 3D layer (ground, baku,
    // particles) re-syncs on every applyTheme call — the cost is negligible
    // and it prevents desync on route-change where currentIsLight matches.
    const detail: ThemeAppliedPort = {
      isLight: shouldUseLight,
      sectionIndex: this.currentSectionIndex,
      sectionId,
      themeChanged: true,
      mode,
      snap,
    }
    eventBus.emit('jlz:theme-applied', detail)
  }

  private setupThemeSync() {
    // route-change: invalidate cache on page switch + re-apply the active
    // section's theme on the NEW page. (H13 fix: without this, uk-light from
    // the last active section on the PREVIOUS page persists on <body> until
    // the first section nav on the new page → wrong-theme flash + EnvSphere
    // desync. Find the active section in the freshly-rendered DOM and apply
    // its theme immediately.)
    this.routeChangeUnsub = eventBus.on('jlz:route-change', () => {
      this.cachedConfigs = null
      this.currentSectionId = null
      this.currentSectionIndex = -1
      const active = this.contentRoot().querySelector<HTMLElement>(
        '[data-section].section-active, [data-page-section].section-active',
      )
      const sectionId =
        active?.getAttribute('data-section') ?? active?.getAttribute('data-page-section') ?? 'intro'
      this.currentSectionId = sectionId
      this.applyTheme(sectionId)
    })

    // theme-change: re-apply the current section theme. Fallback chain if
    // currentSectionId was cleared (e.g. by a prior route-change):
    // 1) active DOM section (.section-active), 2) 'intro'. Without this,
    // toggling theme right after page load (before any section navigation)
    // would no-op — currentSectionId was null.
    this.themeChangeUnsub = eventBus.on('jlz:theme-change', () => {
      let sectionId = this.currentSectionId
      if (!sectionId) {
        const active = this.contentRoot().querySelector<HTMLElement>(
          '[data-section].section-active, [data-page-section].section-active',
        )
        sectionId =
          active?.getAttribute('data-section') ??
          active?.getAttribute('data-page-section') ??
          'intro'
        this.currentSectionId = sectionId
      }
      // snap=true: theme toggle → EnvSphere must change instantly (no lerp)
      // to match the instant CSS uk-light flip.
      this.applyTheme(sectionId, true)
    })
  }

  destroy() {
    if (this._destroyed) return
    this._destroyed = true
    if (this._uiKitUpdateFrame !== null) {
      cancelAnimationFrame(this._uiKitUpdateFrame)
      this._uiKitUpdateFrame = null
    }
    if (this.sectionHandler) eventBus.off('jlz:section-change', this.sectionHandler)
    this.pageSectionUnsub?.()
    this.themeChangeUnsub?.()
    this.routeChangeUnsub?.()
    this.pageSectionUnsub = this.themeChangeUnsub = this.routeChangeUnsub = null
    document.documentElement.classList.toggle('uk-light', this._initialHtmlLight)
    document.body.classList.toggle('uk-light', this._initialBodyLight)
  }
}
