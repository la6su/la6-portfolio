import { FullscreenOverlay } from './FullscreenOverlay'
import { eventBus } from '../core/EventBus'

export class UIManager {
  private _overlay: FullscreenOverlay | null = null
  private _overlayHostUnsub: (() => void) | null = null

  /** Adopt Vue-owned modal markup when the runtime first needs its behavior. */
  get overlay(): FullscreenOverlay | null {
    if (this._overlay) return this._overlay
    const element = document.getElementById('jlz-fs-overlay')
    if (!(element instanceof HTMLDivElement)) return null
    this._overlay = new FullscreenOverlay(element)
    return this._overlay
  }

  /** Initialize persistent UI behavior owners. */
  init(): void {
    this._overlayHostUnsub = eventBus.on('jlz:fullscreen-overlay-unmounted', () => {
      this._overlay?.dispose()
      this._overlay = null
    })
  }

  /** Clean up UI components. */
  dispose(): void {
    this._overlayHostUnsub?.()
    this._overlayHostUnsub = null
    this._overlay?.dispose()
    this._overlay = null
  }
}
