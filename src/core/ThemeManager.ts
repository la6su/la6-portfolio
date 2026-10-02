// Persists the auto/inverse theme mode and notifies the app when it changes.

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
