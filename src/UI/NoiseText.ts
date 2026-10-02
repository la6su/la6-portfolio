// Typewriter reveal with a short noise tail for section eyebrows.

import { TextReveal } from './TextReveal'

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

  /** Reveal an eyebrow label. The text resolves from
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

  /** Keep the authored text visible until the first animation frame. */
  protected begin(): void {
    this.el.textContent = this.cleanText
  }

  /** Progressive reveal: fixedLength grows from 0 to text.length. */
  protected renderFrame(t: number): void {
    const fixedLength = Math.floor(t * this.cleanText.length)
    // Noise tail: 1-3 random characters after the fixed portion
    const noiseLength = Math.min(3, this.cleanText.length - fixedLength)

    // Reuse the character buffer and join once per frame.
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
