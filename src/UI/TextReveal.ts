// Shared lifecycle for the two bespoke DOM text reveals.

export abstract class TextReveal {
  private static readonly active = new Set<TextReveal>()

  static disposeAll(): void {
    for (const instance of TextReveal.active) instance.finalize()
  }

  protected readonly el: HTMLElement
  /** The clean source text captured by show() (read-before-cancel contract). */
  protected cleanText = ''
  private rafId: number | null = null
  private timeoutId: number | null = null
  private running = false
  private start = 0
  private dur = 1000

  protected constructor(el: HTMLElement) {
    this.el = el
  }

  /** Frame-0 DOM setup after show() passed its guards (spans / clean text). */
  protected abstract begin(): void
  /** Per-frame render at progress t ∈ [0, 1). */
  protected abstract renderFrame(t: number): void
  /** Final DOM state when the animation ends or is torn down. */
  protected abstract restoreFinalDom(): void
  /** Show-only attribute cleanup in hide() (e.g. the aria-label). */
  protected abstract clearShowAttributes(): void

  show(dur: number = 0.6, sourceText?: string): void {
    // Read the source before cancel(), which restores the previous text. This
    // preserves a translation applied between consecutive reveals.
    const text = sourceText ?? (this.el.textContent || '')
    this.cancel()
    this.cleanText = text
    if (this.cleanText.length === 0) return

    this.dur = dur * 1000
    this.running = true
    TextReveal.active.add(this)
    this.start = performance.now()
    this.el.setAttribute('data-visible', 'true')
    this.begin()

    // Safety timeout → guarantees finalize() fires even if RAF is throttled
    // (background tab or a suspended rendering loop).
    this.timeoutId = window.setTimeout(() => this.finalize(), this.dur + 200)
    this.rafId = requestAnimationFrame(this.tick)
  }

  hide(): void {
    this.finalize()
    if (this.cleanText) this.el.textContent = this.cleanText
    this.clearShowAttributes()
    this.el.removeAttribute('data-visible')
  }

  finalize(): void {
    this.running = false
    TextReveal.active.delete(this)
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId)
      this.timeoutId = null
    }
    this.restoreFinalDom()
  }

  /** Lightweight cancel — restores clean text and cancels RAF+timeout.
   *  MUST restore cleanText before a new show() reads DOM (prevents stale
   *  noise/stale spans being captured as cleanText on rapid re-trigger). */
  private cancel(): void {
    this.running = false
    TextReveal.active.delete(this)
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId)
      this.timeoutId = null
    }
    if (this.cleanText) {
      this.el.textContent = this.cleanText
    }
  }

  private tick = (ts: number): void => {
    if (!this.running) return
    if (!this.el.isConnected) {
      this.finalize()
      return
    }
    const t = Math.min(1, (ts - this.start) / this.dur)
    if (t >= 1) {
      this.finalize()
      return
    }
    this.renderFrame(t)
    this.rafId = requestAnimationFrame(this.tick)
  }
}
