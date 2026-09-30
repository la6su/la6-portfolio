// BlurFade — cinematic blur+stagger reveal for section titles.
//
// Effect: characters appear with random X/Y offset + blur, then settle
// into their final position with a stagger. More cinematic than typewriter.
//
// Each character: starts offset (translateY + rotate) + blurred, animates
// to clean position. Staggered timing = wave-like reveal.
//
// Used by: entry-app.ts (IntersectionObserver reveal on .studio-title), FullscreenOverlay title.
// For console-style typewriter (eyebrow numbers), see NoiseText.ts.
//
// Lifecycle machinery (RAF + safety timeout, cleanText contract, finalize/
// cancel/hide, teardown registry) is shared in textReveal.ts; only the
// per-character DOM rendering lives here.

import { TextReveal } from './textReveal'
import { easeOutCubic } from '../Utils/easing'

export class BlurFade extends TextReveal {
  /** Per-class registry: one instance per DOM element, prevents overlap. */
  private static instances = new WeakMap<HTMLElement, BlurFade>()

  static for(el: HTMLElement): BlurFade {
    let inst = BlurFade.instances.get(el)
    if (!inst) {
      inst = new BlurFade(el)
      BlurFade.instances.set(el, inst)
    }
    return inst
  }

  /** Stop every active blur animation owned by the current Experience. */
  static disposeAll(): void {
    TextReveal.disposeAllWhere((instance) => instance instanceof BlurFade)
  }

  /** Reveal a section title, collapsing the guard blocks the boot shell and
   *  Experience repeated per event. Honors the `data-blur-fade="off"`
   *  opt-out and the empty-text guard. With an explicit `sourceText` the
   *  text becomes the reveal's cleanText (the splash path); without one the
   *  reveal reads the DOM itself, as before. */
  static reveal(el: HTMLElement, dur: number, sourceText?: string): void {
    if (el.dataset.blurFade === 'off') return
    const text = (sourceText ?? el.textContent) || ''
    if (!text.trim()) return
    BlurFade.for(el).show(dur, sourceText === undefined ? undefined : text)
  }

  /** Rotation values are authored once per reveal, not re-parsed per RAF. */
  private readonly rotations: number[] = []

  private constructor(el: HTMLElement) {
    super(el)
  }

  /** Build the per-character spans (frame 0, before the first RAF tick). */
  protected begin(): void {
    this.el.setAttribute('aria-label', this.cleanText)
    this.rotations.length = 0

    // Build spans through DOM APIs. Titles can come from translated/editorial
    // content, so interpolating them into innerHTML would turn markup into
    // executable DOM and pay an avoidable HTML parse cost on every reveal.
    const spans = Array.from(this.cleanText, (ch) => {
      const span = document.createElement('span')
      const rot = (Math.random() - 0.5) * 30
      span.setAttribute('aria-hidden', 'true')
      span.style.cssText =
        'display:inline-block;opacity:0;transform:translateY(20px) rotate(' +
        `${rot}deg);filter:blur(8px);transition:none;`
      span.dataset.rot = String(rot)
      this.rotations.push(rot)
      span.textContent = ch === ' ' ? '\u00a0' : ch
      return span
    })
    this.el.replaceChildren(...spans)
  }

  /** Staggered per-character interpolation. */
  protected renderFrame(t: number): void {
    const spans = this.el.children
    const n = spans.length
    // Stagger: each character starts at a different time
    const staggerDelay = 0.3 // 30% of duration for stagger spread
    for (let i = 0; i < n; i++) {
      const span = spans[i] as HTMLElement
      const charDelay = (i / n) * staggerDelay
      // Ease out cubic (the helper clamps the raw staggered t)
      const eased = easeOutCubic((t - charDelay) / (1 - staggerDelay))
      const opacity = eased
      const translateY = 20 * (1 - eased)
      const rotate = (this.rotations[i] ?? 0) * (1 - eased)
      const blur = 8 * (1 - eased)
      span.style.opacity = String(opacity)
      span.style.transform = `translateY(${translateY}px) rotate(${rotate}deg)`
      span.style.filter = `blur(${blur}px)`
    }
  }

  /** Set spans to their final resting state IN PLACE (do NOT removeAttribute
   *  style — that drops display:inline-block → inline, breaking per-character
   *  shift). Keep display:inline-block so the box model matches the during-anim
   *  state exactly. Set transform='none' and filter='none' (NOT translateY(0)/
   *  blur(0px)) — 'none' removes the compositing layer + filter pipeline, which
   *  changes subpixel AA vs the animated state. opacity='1' is the final value. */
  protected restoreFinalDom(): void {
    const spans = this.el.children
    for (let i = 0; i < spans.length; i++) {
      const sp = spans[i] as HTMLElement
      sp.style.opacity = '1'
      sp.style.transform = 'none'
      sp.style.filter = 'none'
    }
  }

  protected clearShowAttributes(): void {
    this.el.removeAttribute('aria-label')
  }
}
