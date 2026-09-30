// src/core/ThemeManager.ts — Theme manager with 2 modes (auto/inverse)
//
// PER-SECTION inverse approach:
//   - 'auto'    (default) — sections use their preset theme from WorldConfig
//   - 'inverse' — INVERTS each section's theme (light↔dark)
//
// ContentReveal.ts applies uk-light/uk-dark per-section on section change:
//   auto:    sectionTheme='light' → uk-light (light bg, dark text)
//            sectionTheme='dark'  → no uk-light (dark bg, light text)
//   inverse: sectionTheme='light' → no uk-light (dark bg, light text)
//            sectionTheme='dark'  → uk-light (light bg, dark text)
//
// This means inverse flips the ENTIRE palette — light sections become dark
// and dark sections become light. Simple, logical, per-section.
//
// Persists to localStorage('jlz:theme').
// 3D sync: ContentReveal dispatches 'jlz:theme-applied' with {isLight} so
// Experience.ts can sync EnvSphere background per-section.

import { eventBus } from './EventBus'

export type ThemeMode = 'auto' | 'inverse'

const STORAGE_KEY = 'jlz:theme'

class ThemeManager {
  private _mode: ThemeMode = 'auto'

  constructor() {
    this._mode = this._loadMode()
  }

  get mode(): ThemeMode {
    return this._mode
  }

  /** Whether inverse mode is active (for UI label). */
  get isInverse(): boolean {
    return this._mode === 'inverse'
  }

  setMode(mode: ThemeMode): void {
    if (mode === this._mode) return
    this._mode = mode
    this._saveMode(mode)
    // Notify ContentReveal to re-apply per-section theme
    eventBus.emit('jlz:theme-change', { mode })
  }

  /** Toggle auto ↔ inverse. */
  toggle(): ThemeMode {
    this.setMode(this._mode === 'auto' ? 'inverse' : 'auto')
    return this._mode
  }

  private _loadMode(): ThemeMode {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === 'auto' || stored === 'inverse') return stored
    } catch {
      /* localStorage unavailable */
    }
    return 'auto'
  }

  private _saveMode(mode: ThemeMode): void {
    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      /* localStorage unavailable */
    }
  }
}

export const themeManager = new ThemeManager()
