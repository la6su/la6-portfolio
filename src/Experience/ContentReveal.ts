// src/Experience/ContentReveal.ts
// Section sync: applies the per-section theme; Vue owns the active class.
//
// PER-SECTION THEME (KISS):
//   Each section's PhaseConfig has theme: 'light' | 'dark' in WorldConfig.
//   On section change, toggle uk-light on <html> + <body>:
//     auto:    light → uk-light, dark → no uk-light
//     inverse: FLIPPED — light → no uk-light, dark → uk-light
//   The effective decision + the jlz:theme-applied detail shape are the
//   typed sectionTheme contract; EnvSphere syncs via that event.

import { eventBus } from '../core/EventBus'
import type { PageId } from '../core/routeManifest'
import { themeManager, type ThemeMode } from '../core/ThemeManager'
import { getWorldConfigForPage, type PhaseConfig } from '../core/WorldConfig'
import { resolveEffectiveTheme, type ThemeAppliedPort } from '../core/sectionTheme'

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
    const active = this.contentRoot().querySelector<HTMLElement>(
      '[data-section].section-active, [data-page-section].section-active',
    )
    const sectionId =
      active?.getAttribute('data-section') ?? active?.getAttribute('data-page-section') ?? 'intro'
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
    this.sectionUnsub = eventBus.on('jlz:section-change', (payload) => {
      if (!payload?.sectionId) return
      this.applyTheme(payload.sectionId)
    })

    // Content pages: jlz:page-section-change (data-page-section)
    this.pageSectionUnsub = eventBus.on('jlz:page-section-change', ({ index, sectionId }) => {
      this.applyTheme(sectionId, false, index)
    })
  }

  private applyTheme(sectionId: string, snap = false, sectionIndexHint = -1): void {
    const configs = this.getConfigs()
    const cfg = configs.find((c) => c.domSection === sectionId || c.id === sectionId)
    // Config identity is canonical when present. Keep the nav index only for
    // a semantic fallback section without a world-config entry.
    const sectionIndex = cfg ? configs.indexOf(cfg) : sectionIndexHint
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
      sectionIndex,
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
      const active = this.contentRoot().querySelector<HTMLElement>(
        '[data-section].section-active, [data-page-section].section-active',
      )
      const sectionId =
        active?.getAttribute('data-section') ?? active?.getAttribute('data-page-section') ?? 'intro'
      this.applyTheme(sectionId)
    })

    // Vue's active class is the source for the section under the current
    // theme. The DOM fallback covers the instant before the first route render.
    this.themeChangeUnsub = eventBus.on('jlz:theme-change', () => {
      const active = this.contentRoot().querySelector<HTMLElement>(
        '[data-section].section-active, [data-page-section].section-active',
      )
      const sectionId =
        active?.getAttribute('data-section') ??
        active?.getAttribute('data-page-section') ??
        'intro'
      // snap=true: theme toggle → EnvSphere must change instantly (no lerp)
      // to match the instant CSS uk-light flip.
      this.applyTheme(sectionId, true)
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
