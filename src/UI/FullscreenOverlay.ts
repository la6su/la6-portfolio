// FullscreenOverlay.ts — One UIkit fullscreen shell for Works case media.
//
// Single overlay with:
//   - Decoded still poster (textureUrl) shown fullscreen
//   - Project info (title, category, description, tags, counter)
//   - Prev/next navigation arrows (optional)
//   - UIKit3 uk-modal base (Esc to close, bg-close, focus trap)
//
// Video playback is not part of this surface: the only video source belongs
// to the ShowreelTheater render mode (ShowreelConsole.vue chrome), so the
// overlay is image-only by construction.

import UIkit from 'uikit'
import { BlurFade } from './BlurFade'
import { eventBus } from '../core/EventBus'
import { prefersReducedMotion } from '../core/motionPolicy'

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true',
  )
}

export interface OverlayOptions {
  // Poster image URL (textureUrl) — decoded before the overlay reveals
  poster?: string
  // Project info (optional)
  title?: string
  category?: string
  description?: string
  tags?: string[]
  counter?: string // e.g. "1 / 8"
  // Navigation (optional)
  hasPrev?: boolean
  hasNext?: boolean
  /** Called when the overlay closes (per-open, not a persistent handler). */
  onClose?: () => void
}

export class FullscreenOverlay {
  private container: HTMLDivElement
  private posterEl: HTMLDivElement
  private prevBtn: HTMLButtonElement
  private nextBtn: HTMLButtonElement
  private titleEl: HTMLElement
  private catEl: HTMLElement
  private descEl: HTMLElement
  private tagsEl: HTMLElement
  private counterEl: HTMLElement
  private _keydownHandler: ((e: KeyboardEvent) => void) | null = null
  private _focusTrapHandler: ((e: FocusEvent) => void) | null = null
  private _lastShiftTab = false
  private _enterFallback: number | null = null
  private _shownRevealFrame: number | null = null
  private _posterRequestId = 0
  private _posterUrl: string | null = null
  private _mediaGeneration = 0
  private readonly _listeners = new AbortController()

  private _perOpenOnClose: (() => void) | null = null
  private _restoreFocus: HTMLElement | null = null
  private _hideHandled = false
  private readonly _closeMediaLayerUnsub: () => void

  private readonly _onModalHide = (): void => {
    this.handleHide()
  }
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
    // Wire elements
    this.posterEl = this.container.querySelector('.jlz-fs-poster')!
    this.prevBtn = this.container.querySelector('.jlz-fs-prev')!
    this.nextBtn = this.container.querySelector('.jlz-fs-next')!
    this.titleEl = this.container.querySelector('.jlz-fs-title')!
    this.catEl = this.container.querySelector('.jlz-fs-cat')!
    this.descEl = this.container.querySelector('.jlz-fs-desc')!
    this.tagsEl = this.container.querySelector('.jlz-fs-tags')!
    this.counterEl = this.container.querySelector('.jlz-fs-counter')!

    // Nav buttons
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
    UIkit.util.on(this.container, 'hide', this._onModalHide)
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
    // Close ownership is per-open, so a completed cycle cannot leak a
    // callback into the next media item.
    this._perOpenOnClose?.()
    this._perOpenOnClose = null
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

  /** Open overlay with given options. */
  open(opts: OverlayOptions): void {
    this._applyOptions(opts)
    // Capture before UIkit handles the show event; it may move focus into the
    // modal before this overlay's event callbacks run.
    this._restoreFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    UIkit.modal(this.container).show()
  }
  /** Preload content into the overlay WITHOUT showing it.
   *  Used by Experience.ts to preload the first project so card click is
   *  instant. preload() only sets content; the uk-open class is NOT added,
   *  so the overlay stays hidden (CSS: .jlz-fs-overlay:not(.uk-open){display:none}). */
  preload(opts: OverlayOptions): void {
    this._applyOptions(opts)
    // Do NOT call UIkit.modal().show() — stay hidden.
  }

  /** Apply overlay options to the DOM (shared by open + preload). */
  private _applyOptions(opts: OverlayOptions): void {
    this._hideHandled = false
    this._mediaGeneration += 1
    // Store the per-open close callback (called in the 'hide' handler).
    this._perOpenOnClose = opts.onClose ?? null
    this.container.classList.add('is-image-mode')

    this.setPoster(opts.poster)

    // Project info
    if (opts.title) {
      if (prefersReducedMotion()) {
        this.titleEl.textContent = opts.title
        this.titleEl.setAttribute('aria-label', opts.title)
      } else {
        BlurFade.for(this.titleEl).show(0.8, opts.title)
      }
    } else {
      this.titleEl.textContent = ''
    }
    this.catEl.textContent = opts.category ?? ''
    this.descEl.textContent = opts.description ?? ''
    this.counterEl.textContent = opts.counter ?? ''
    this.tagsEl.replaceChildren(
      ...(opts.tags ?? []).filter(Boolean).map((tag) => {
        const element = document.createElement('span')
        element.className = 'jlz-fs-tag uk-text-meta uk-text-uppercase'
        element.textContent = tag
        return element
      }),
    )

    // Nav buttons visibility
    this.prevBtn.style.display = opts.hasPrev ? '' : 'none'
    this.nextBtn.style.display = opts.hasNext ? '' : 'none'
  }

  /**
   * Decode the DOM poster before exposing it. During a plane-origin handoff
   * the modal stays transparent until this succeeds, leaving the already
   * fullscreen Three.js plane visible instead of a transient black frame.
   */
  private setPoster(poster?: string): void {
    if (poster === this._posterUrl && this.container.classList.contains('is-poster-ready')) {
      this.posterEl.style.opacity = '1'
      return
    }

    const requestId = ++this._posterRequestId
    this._posterUrl = poster ?? null
    this.container.classList.remove('is-poster-ready')
    this.posterEl.style.backgroundImage = ''
    this.posterEl.style.opacity = '0'
    if (!poster) return

    const image = new Image()
    image.decoding = 'async'
    const reveal = () => {
      if (requestId !== this._posterRequestId) return
      this.posterEl.style.backgroundImage = `url('${poster}')`
      this.posterEl.style.opacity = '1'
      this.container.classList.add('is-poster-ready')
    }
    image.addEventListener(
      'load',
      () => {
        void image
          .decode()
          .catch(() => undefined)
          .then(reveal)
      },
      { once: true, signal: this._listeners.signal },
    )
    image.src = poster
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
      // component so body scroll, focus and the per-open callback are settled.
      this.handleHide()
      this._restoreFocus = null
    }
    this._listeners.abort()
    // The title reveal is an independent RAF owner. A preloaded/hidden
    // overlay can be disposed without passing through `hide`; cancel it
    // synchronously so the static BlurFade registry cannot retain this DOM.
    BlurFade.for(this.titleEl).hide()
    this._posterRequestId += 1
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
