// NoiseText — junni-style typewriter reveal with noise tail.
//
// Proven stable pattern: combines 64002f9 (typewriter algorithm) +
// 39eda64 stability fixes (Frame 0 = clean text, cancel restores cleanText).
//
// Critical guarantees (from 39eda64):
// 1. Frame 0 = correct text → no flash of empty/noisy state.
// 2. Final frame = ALWAYS clean text (finalize restores cleanText).
// 3. cancel() restores cleanText BEFORE new show() reads DOM → no stale
//    noise captured as cleanText on rapid re-trigger (IntersectionObserver).
// 4. Safety timeout guarantees finalize() fires even if RAF is throttled.
//
// Guarantees 3–4 live in the shared TextReveal base (textReveal.ts); the
// typewriter algorithm lives here.
//
// Algorithm (from 64002f9): typewriter with noise tail
// - Characters appear left-to-right (already-revealed = clean)
// - 1-3 random noise chars flicker ahead of the reveal position
// - At t=1.0: full clean text displayed

import { TextReveal } from './textReveal'

const CHARS = '░▒▓█▄▀▌▐│║╟╠╫╬●○◆◇▪▫•·∴∵≈≠≤≥±÷×'

export class NoiseText extends TextReveal {
  /** Per-class registry: one instance per DOM element, prevents overlap. */
  private static instances = new WeakMap<HTMLElement, NoiseText>()

  static for(el: HTMLElement): NoiseText {
    let inst = NoiseText.instances.get(el)
    if (!inst) {
      inst = new NoiseText(el)
      NoiseText.instances.set(el, inst)
    }
    return inst
  }

  /** Stop every active text animation owned by the current Experience. */
  static disposeAll(): void {
    TextReveal.disposeAllWhere((instance) => instance instanceof NoiseText)
  }

  /** Reveal an eyebrow label, collapsing the guard blocks the boot shell and
   *  Experience repeated per event. The text resolves from
   *  `data-eyebrow-text` first (the stable authored source — reading
   *  textContent is unsafe mid-noise) and falls back to the element's text
   *  content. */
  static revealEyebrow(el: HTMLElement, dur: number = 0.6): void {
    const text = el.getAttribute('data-eyebrow-text') ?? el.textContent ?? ''
    if (!text.trim()) return
    NoiseText.for(el).show(dur, text)
  }

  /** Reused frame buffer; only the joined DOM string is transient. */
  private readonly chars: string[] = []

  private constructor(el: HTMLElement) {
    super(el)
  }

  /** Frame 0 = correct text → no flash of empty state.
   *  (Critical fix from 39eda64 — starting with '' causes a visible
   *  empty flash before the first tick.) */
  protected begin(): void {
    this.el.textContent = this.cleanText
  }

  /** Progressive reveal: fixedLength grows from 0 to text.length. */
  protected renderFrame(t: number): void {
    const fixedLength = Math.floor(t * this.cleanText.length)
    // Noise tail: 1-3 random characters after the fixed portion
    const noiseLength = Math.min(3, this.cleanText.length - fixedLength)

    // PERF-15 fix: build via array + join (was `text +=` in a loop = O(N²)
    // string allocation). For a 20-char title: ~23 string allocs/frame → 1.
    const chars = this.chars
    chars.length = fixedLength + noiseLength

    // Fixed (clean) characters — already revealed
    for (let i = 0; i < fixedLength; i++) {
      chars[i] = this.cleanText[i]!
    }

    // Noise tail — random characters that flicker
    for (let i = 0; i < noiseLength; i++) {
      chars[fixedLength + i] = CHARS[Math.floor(Math.random() * CHARS.length)]!
    }

    this.el.textContent = chars.join('')
  }

  /** Final frame = ALWAYS clean text (no glitch residue). */
  protected restoreFinalDom(): void {
    if (this.cleanText) this.el.textContent = this.cleanText
  }

  protected clearShowAttributes(): void {
    // No show-only attributes (data-visible is cleared by the base hide()).
  }
}
