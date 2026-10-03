// FullscreenOverlay.ts — the behavior controller for the Vue-owned fullscreen
// overlay shell (FullscreenOverlayView.vue).
//
// This class owns only what Vue cannot: the UIKit3 modal lifecycle
// (uk-open state, Esc to close, bg-close), the keyboard layer (Escape,
// prev/next arrows, Tab focus trap), and the fullscreen-change events.
// Content (title, category, description, tags, counter, poster, arrow
// visibility) is reactive state in the Vue view, published through the
// typed `jlz:project-content` event by ExperienceUI.
//
// Video playback is not part of this surface: the only video source belongs
// to the ShowreelTheater render mode (ShowreelConsole.vue chrome), so the
// overlay is image-only by construction.

import UIkit from 'uikit'
import { eventBus } from '../core/EventBus'

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true',
  )
}

export class FullscreenOverlay {
  private container: HTMLDivElement
  private prevBtn: HTMLButtonElement
  private nextBtn: HTMLButtonElement
  private _keydownHandler: ((e: KeyboardEvent) => void) | null = null
  private _focusTrapHandler: ((e: FocusEvent) => void) | null = null
  private _lastShiftTab = false
  private _enterFallback: number | null = null
  private _shownRevealFrame: number | null = null
  private _mediaGeneration = 0
  private readonly _listeners = new AbortController()

  private _restoreFocus: HTMLElement | null = null
  private _hideHandled = false
  private readonly _closeMediaLayerUnsub: () => void

  private readonly _onModalHidden = (): void => {
    const target = this._restoreFocus
    this._restoreFocus = null
    if (target?.isConnected) target.focus({ preventScroll: true })
  }

  constructor(container: HTMLDivElement) {
    this.container = container
    if (!this.container.isConnected) {
      throw new Error('Fullscreen overlay must be mounted by AppShell before initialization.')
    }
    // Wire the nav buttons; their visibility is Vue-owned content state.
    this.prevBtn = this.container.querySelector('.jlz-fs-prev')!
    this.nextBtn = this.container.querySelector('.jlz-fs-next')!

    this.prevBtn.addEventListener('click', () => this.navigate(-1), {
      signal: this._listeners.signal,
    })
    this.nextBtn.addEventListener('click', () => this.navigate(1), {
      signal: this._listeners.signal,
    })

    // UIKit3 modal events — uk-open is the authoritative state. UIkit adds it
    // on show and removes it on hide; isOpen reads it directly. No custom
    // enter/opening flags needed.
    UIkit.util.on(this.container, 'show', () => {
      eventBus.emit('jlz:close-nav')
      eventBus.emit('jlz:fullscreen-change', { open: true })
      document.body.classList.add('jlz-media-layer-open')
      document.addEventListener('keydown', this._keydownHandler!)
      document.addEventListener('focusin', this._focusTrapHandler!)
      // Double-rAF fallback: more reliable than fixed timeout.
      // Fires after 2 frames (~32ms at 60Hz), giving UIkit time to
      // process transitions without the arbitrariness of a 120ms guess.
      if (!this._enterFallback) {
        this._enterFallback = requestAnimationFrame(() => {
          this._enterFallback = requestAnimationFrame(() => {
            this._enterFallback = null
            if (!this.container.classList.contains('is-entered')) {
              this.container.classList.add('is-entered')
            }
          })
        })
      }
    })
    UIkit.util.on(this.container, 'shown', () => {
      // Clear the fallback — UIkit confirmed the modal is shown.
      if (this._enterFallback) {
        cancelAnimationFrame(this._enterFallback)
        this._enterFallback = null
      }
      // Trigger the CSS reveal transition (clip-path + scale + opacity).
      const generation = this._mediaGeneration
      this._shownRevealFrame = requestAnimationFrame(() => {
        this._shownRevealFrame = null
        if (generation !== this._mediaGeneration || !this.container.isConnected) return
        this.container.classList.add('is-entered')
      })
      // Move focus into the modal so keyboard users are not stranded behind it.
      this.container.querySelector<HTMLElement>('.jlz-fs-close')?.focus({ preventScroll: true })
    })
    UIkit.util.on(this.container, 'hide', () => this.handleHide())
    UIkit.util.on(this.container, 'hidden', this._onModalHidden)
    // Keyboard: Escape + ArrowLeft/Right (prev/next)
    // Attached to document on 'show', removed on 'hide' (see above).
    // stopImmediatePropagation prevents CinematicNav's window keydown from
    // also firing, so project arrows do not move the story behind the modal.
    this._keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        this._lastShiftTab = e.shiftKey
        const dialog = this.container.querySelector<HTMLElement>('.uk-modal-dialog')
        if (!dialog) return
        const focusables = focusableElements(dialog)
        const first = focusables[0]
        const last = focusables.at(-1)
        if (!first || !last) {
          e.preventDefault()
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus({ preventScroll: true })
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus({ preventScroll: true })
        }
        return
      }
      if (e.key === 'Escape') {
        // Own Escape while the fullscreen surface is active. UIkit may also
        // receive the key through its modal adapter, but stopping propagation
        // here prevents CinematicNav and menu shortcuts behind the overlay
        // from consuming the same key and opening/closing over the surface.
        e.preventDefault()
        e.stopImmediatePropagation()
        this.close()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        e.stopImmediatePropagation()
        this.navigate(-1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        e.stopImmediatePropagation()
        this.navigate(1)
      }
    }

    // Focus trap: keep Tab/Shift+Tab within the overlay dialog.
    // Without this, keyboard users can Tab out of the modal into
    // elements behind it. UIkit 3 modal does NOT enforce a focus trap.
    this._focusTrapHandler = (e: FocusEvent) => {
      const dialog = this.container.querySelector<HTMLElement>('.uk-modal-dialog')
      if (!dialog) return
      if (dialog.contains(e.target as Node)) return
      // Focus escaped the dialog — route it back.
      e.preventDefault()
      const focusables = focusableElements(dialog)
      if (focusables.length === 0) return
      // If Shift+Tab on the first element → wrap to the last; otherwise → first.
      const first = focusables[0]!
      const last = focusables[focusables.length - 1]!
      ;(this._lastShiftTab ? last : first).focus({ preventScroll: true })
    }
    this._closeMediaLayerUnsub = eventBus.on('jlz:close-media-layer', () => {
      if (this.isOpen) this.close()
    })
  }

  private handleHide(): void {
    if (this._hideHandled) return
    this._hideHandled = true
    eventBus.emit('jlz:fullscreen-change', { open: false })
    document.body.classList.remove('jlz-media-layer-open')
    if (this._enterFallback) {
      cancelAnimationFrame(this._enterFallback)
      this._enterFallback = null
    }
    if (this._shownRevealFrame) {
      cancelAnimationFrame(this._shownRevealFrame)
      this._shownRevealFrame = null
    }
    this._mediaGeneration += 1
    this.container.classList.remove('is-entered')
    // Remove keyboard listener when modal closes — clean lifecycle, no
    // stale listeners intercepting events while the overlay is hidden.
    document.removeEventListener('keydown', this._keydownHandler!)
    if (this._focusTrapHandler) {
      document.removeEventListener('focusin', this._focusTrapHandler)
    }
  }

  private navigate(direction: -1 | 1): void {
    eventBus.emit('jlz:project-navigate', { direction })
  }

  /**
   * Open the overlay. Content is published separately (and before this call)
   * through `jlz:project-content`; the Vue view binds it, so the modal opens
   * with the committed content.
   */
  open(): void {
    this._hideHandled = false
    this._mediaGeneration += 1
    // Capture before UIkit handles the show event; it may move focus into the
    // modal before this overlay's event callbacks run.
    this._restoreFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    UIkit.modal(this.container).show()
  }

  close(): void {
    UIkit.modal(this.container).hide()
  }

  /** Whether the UIKit modal is currently open (uk-open class present).
   *  This is UIKit's native state — always accurate, no custom flag to sync. */
  get isOpen(): boolean {
    return this.container.classList.contains('uk-open')
  }

  dispose(): void {
    this._closeMediaLayerUnsub()
    if (this.isOpen) {
      const modal = UIkit.modal(this.container)
      modal.hide()
      // UIkit normally emits `hide`, but a teardown can race its transition.
      // Run the same idempotent cleanup synchronously before destroying the
      // component so body scroll and focus are settled.
      this.handleHide()
      this._restoreFocus = null
    }
    this._listeners.abort()
    this._mediaGeneration += 1
    if (this._enterFallback) {
      cancelAnimationFrame(this._enterFallback)
      this._enterFallback = null
    }
    if (this._shownRevealFrame) {
      cancelAnimationFrame(this._shownRevealFrame)
      this._shownRevealFrame = null
    }
    if (this._keydownHandler) {
      document.removeEventListener('keydown', this._keydownHandler)
      this._keydownHandler = null
    }
    if (this._focusTrapHandler) {
      document.removeEventListener('focusin', this._focusTrapHandler)
      this._focusTrapHandler = null
    }
    UIkit.modal(this.container).$destroy()
  }
}
