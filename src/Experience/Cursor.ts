// src/Experience/Cursor.ts — Custom cursor with codrops-style noisy circle.
//
// Two elements (both small, follow mouse via transform):
//   1. Inner dot (6px) — follows mouse instantly, centered via translate -50%
//   2. Outer circle (canvas 120×120px) — follows with smooth lerp(0.12),
//      noisy distortion on hover, fill on hover, bump on click
//
// Features (ported from codrops demo1+demo3+demo4):
//   - Magnetic snap to element center on hover (demo4/tutorial)
//   - Noise distortion when expanded (demo4/tutorial)
//   - Fill with accent color on hover (demo4)
//   - Hide inner dot on hover (demo4)
//   - Bump on click — radius scale 0.7 → 1.0 bounce (demo1)
//
// No GSAP, no paper.js — pure Canvas 2D + custom noise2D.

// (DeviceCapability import removed — mobile detection now handled by CSS
//  @media (pointer: coarse) in main.less, which is more reliable than JS.)
import { brandToken } from '../core/brandTokens'
import { lerp } from '../Utils/easing'

const CURSOR_ACCENT = brandToken('jlz-color-accent')!
const CURSOR_ACCENT_GLOW = brandToken('jlz-color-accent-glow')!
const CURSOR_TEAL = brandToken('jlz-color-signal-teal')!

/** Elements the cursor snaps/fills on. Shared by the mouseover and mouseout
 *  handlers — the intra-element transition guard (D-14) must consult the
 *  exact same selector on both sides. */
const INTERACTIVE_SEL =
  '[data-magnetic], a, button, .interactive, [uk-toggle], [uk-slider], [uk-dropdown], [uk-tooltip], [uk-modal], [uk-lightbox]'

function noise2D(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return (n - Math.floor(n)) * 2 - 1
}

// Phase 2: canvas 100→120 for larger cursor (baseRadius 28 + targetRadius 44)
const CANVAS_SIZE = 120
const CANVAS_HALF = CANVAS_SIZE / 2
const SMOOTH_SEGMENTS = 16

type CursorThemeColors = { accent: string; accentGlow: string; teal: string }

export class Cursor {
  private _disposed = false
  private innerEl: HTMLElement
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D | null
  private posX = 0
  private posY = 0
  private targetX = 0
  private targetY = 0
  private innerX = 0
  private innerY = 0
  private readonly sfx?: { play: (name: 'hover' | 'click' | 'open' | 'close') => void }

  // Cached theme colors — read once from CSS variables, refreshed on theme change.
  // Avoids 4× getComputedStyle per redraw (was a per-frame allocation hotspot).
  private _cachedAccent = CURSOR_ACCENT
  private _cachedAccentGlow = CURSOR_ACCENT_GLOW
  private _cachedTeal = CURSOR_TEAL
  private readonly _themeColors: CursorThemeColors = {
    accent: this._cachedAccent,
    accentGlow: this._cachedAccentGlow,
    teal: this._cachedTeal,
  }
  private _cacheDirty = true
  // A theme change can leave the cursor's geometry completely settled while
  // its palette has changed. Consume this one-shot redraw request in the same
  // gate as motion so a settled loop gets exactly one fresh canvas paint.
  private _forceRedraw = false
  private readonly _ringPoints = Array.from({ length: SMOOTH_SEGMENTS }, () => ({ x: 0, y: 0 }))

  /** Refresh cached theme colors from CSS variables. Call on theme change. */
  refreshThemeCache(): void {
    if (this._disposed) return
    const styles = getComputedStyle(document.documentElement)
    this._cachedAccent = styles.getPropertyValue('--jlz-color-accent').trim() || CURSOR_ACCENT
    this._cachedAccentGlow =
      styles.getPropertyValue('--jlz-color-accent-glow').trim() || CURSOR_ACCENT_GLOW
    this._cachedTeal = styles.getPropertyValue('--jlz-color-signal-teal').trim() || CURSOR_TEAL
    this._themeColors.accent = this._cachedAccent
    this._themeColors.accentGlow = this._cachedAccentGlow
    this._themeColors.teal = this._cachedTeal
    this._cacheDirty = false
    this._forceRedraw = true
  }

  /** Get cached colors, refreshing if dirty. */
  private _getThemeColors(): CursorThemeColors {
    if (this._cacheDirty) this.refreshThemeCache()
    return this._themeColors
  }

  // Phase 2: spring physics for wobble (skaltenegger-style, smoothed)
  // Outer circle lags behind mouse with spring-damper, giving organic wobble
  // Stiffness lowered (0.25→0.18) + damping raised (0.55→0.7) for smoother motion
  private velX = 0
  private velY = 0
  private readonly springStiffness = 0.18
  private readonly springDamping = 0.7

  // Custom cursor states (data-cursor attribute)
  // 'play' → triangle, 'drag' → hand, 'view' → eye (the only states drawn;
  // drawCircle has no speaker glyph — never promise one here).
  private cursorState: string | null = null

  // Noisy circle state
  private isStuck = false
  private stuckX = 0
  private stuckY = 0
  // Phase 6: spring physics replaces instant magnetic snap — cursor eases
  // toward element center with spring-damper (organic wobble, not instant jump)
  // Phase 2: larger cursor (baseRadius 20→28, targetRadius 36→44)
  private currentRadius = 28
  private readonly baseRadius = 28
  private readonly targetRadius = 44
  private readonly noiseScale = 150
  private readonly noiseRange = 3
  private frameCount = 0
  // Last-draw state — skip canvas redraw when nothing changed
  private _lastDrawX = 0
  private _lastDrawY = 0
  private _lastDrawR = 0
  private _lastDrawFill = 0
  private _lastDrawBump = 1
  private _lastDrawStuck = false
  private _lastDrawState: string | null = null
  // PERF-3 fix: track last-written DOM values to skip redundant style writes.
  // Was writing style.transform + classList.toggle every frame even when idle.
  private _lastInnerX = -Infinity
  private _lastInnerY = -Infinity
  private _lastCanvasX = -Infinity
  private _lastCanvasY = -Infinity
  private _lastIsStuck = false

  // Click bump state (demo1)
  private bumpScale = 1
  private bumpTarget = 1

  // Fill state (demo4 — fill circle on hover)
  private fillProgress = 0
  private fillTarget = 0

  /**
   * Loop-wake port (Phase 7). The single renderer-loop driver runs frames
   * only while the scene or the cursor is unsettled; the cursor's own
   * pointer/hover/click handlers report activity through this callback so a
   * pointer move can wake a settled loop. Wired by the Experience bootstrap.
   */
  onActivity: (() => void) | null = null

  /**
   * True when the spring + radius/bump/fill lerps have converged on their
   * goals (nothing needs another frame for the cursor). Read by the Phase 7
   * scheduler's settle decision after each frame.
   */
  get isSettled(): boolean {
    if (this._disposed) return true
    const goalX = this.isStuck ? this.stuckX : this.targetX
    const goalY = this.isStuck ? this.stuckY : this.targetY
    const targetR = this.isStuck ? this.targetRadius : this.baseRadius
    return (
      Math.abs(this.velX) < 0.01 &&
      Math.abs(this.velY) < 0.01 &&
      Math.abs(this.posX - goalX) < 0.5 &&
      Math.abs(this.posY - goalY) < 0.5 &&
      Math.abs(this.currentRadius - targetR) < 0.05 &&
      Math.abs(this.bumpScale - this.bumpTarget) < 0.005 &&
      Math.abs(this.fillProgress - this.fillTarget) < 0.005
    )
  }

  private readonly mousemoveHandler: (e: MouseEvent) => void
  private readonly mouseoverHandler: (e: MouseEvent) => void
  private readonly mouseoutHandler: (e: MouseEvent) => void
  private readonly clickHandler: (e: MouseEvent) => void

  constructor(sfx?: { play: (name: 'hover' | 'click' | 'open' | 'close') => void }) {
    this.sfx = sfx
    this.innerEl = document.createElement('div')
    this.innerEl.classList.add('custom-cursor-inner')

    this.canvas = document.createElement('canvas')
    this.canvas.classList.add('custom-cursor-canvas')
    this.canvas.width = CANVAS_SIZE
    this.canvas.height = CANVAS_SIZE
    this.ctx = this.canvas.getContext('2d')

    const forceCursor = (() => {
      try {
        return localStorage.getItem('jlz:force-cursor') === '1'
      } catch {
        return false
      }
    })()
    // (Mobile detection removed — CSS @media (pointer: coarse) already hides
    //  the cursor elements via display:none. The old DeviceCapability.isMobile
    //  check was hiding the cursor on touch-screen laptops even when a mouse
    //  was present. CSS media query is more reliable.)
    if (forceCursor) {
      document.documentElement.classList.add('jlz-force-cursor')
    }

    document.body.appendChild(this.innerEl)
    document.body.appendChild(this.canvas)

    this.mousemoveHandler = (e: MouseEvent) => {
      this.targetX = e.clientX
      this.targetY = e.clientY
      this.onActivity?.()
    }
    this.mouseoverHandler = (e: MouseEvent) => {
      this.onActivity?.()
      const target = e.target as HTMLElement
      if (!target || typeof target.closest !== 'function') return
      // D-14 fix: skip intra-element transitions (mouseout→mouseover between
      // child elements of the same interactive). Checks relatedTarget — if the
      // mouse is moving TO another element within the same interactive, skip.
      const related = e.relatedTarget as HTMLElement | null
      if (related && typeof related.closest === 'function' && related.closest(INTERACTIVE_SEL)) {
        // Moving to another interactive (or child of same) — let that mouseover
        // handle it. Prevents the flicker where mouseout fires for a child then
        // mouseover re-fires for the parent (isStuck briefly goes false→true).
        return
      }
      // Phase 2: check for custom cursor state (data-cursor attribute)
      const stateEl = target.closest('[data-cursor]') as HTMLElement | null
      this.cursorState = stateEl?.dataset.cursor ?? null
      // Fullscreen overlay buttons opt out of magnetic snap — the overlay is
      // a focused viewing surface where a snapping cursor is distracting.
      if (target.closest('[data-no-magnetic]')) {
        this.isStuck = false
        this.fillTarget = 0
        return
      }
      const interactive = target.closest(INTERACTIVE_SEL) as HTMLElement | null
      if (interactive) {
        // For large menu items, DON'T snap to center —
        // the labels are large (clamp 1.25-1.75rem), snapping to center looks weird.
        // Instead, follow mouse + expand + fill (no stuckX/Y override).
        // Menu overlay = [data-section="menu"] (home) / [data-page-section="page-menu"] (content).
        const isLargeMenu = interactive.closest(
          '.jlz-menu-nav__toggle, [data-section="menu"], [data-page-section="page-menu"]',
        )
        if (isLargeMenu) {
          this.stuckX = this.targetX
          this.stuckY = this.targetY
        } else {
          // Normal interactive: snap to element CENTER (codrops behavior)
          const rect = interactive.getBoundingClientRect()
          this.stuckX = rect.left + rect.width / 2
          this.stuckY = rect.top + rect.height / 2
        }
        // D-14 fix: only play hover SFX on false→true transition (was playing
        // on every mouseover, including intra-element moves — SFX spam).
        const wasStuck = this.isStuck
        this.isStuck = true
        this.fillTarget = 1
        if (!wasStuck) this.sfx?.play('hover')
      } else {
        this.isStuck = false
        this.fillTarget = 0
      }
    }
    this.mouseoutHandler = (e: MouseEvent) => {
      this.onActivity?.()
      const target = e.target as HTMLElement
      if (!target || typeof target.closest !== 'function') return
      // D-14 fix: skip if moving to a related element that's also interactive
      // (intra-element transition). Prevents the isStuck flicker.
      const related = e.relatedTarget as HTMLElement | null
      if (related && typeof related.closest === 'function' && related.closest(INTERACTIVE_SEL)) {
        return
      }
      if (target.closest(INTERACTIVE_SEL)) {
        this.isStuck = false
        this.fillTarget = 0
      }
    }
    this.clickHandler = () => {
      // A settled demand-driven loop has no frame available to animate the
      // click bump unless the event explicitly wakes the scheduler.
      this.onActivity?.()
      // Bump: radius scales down to 0.7, then bounces back to 1.0
      this.bumpScale = 0.6
      this.bumpTarget = 1
      this.sfx?.play('click')
    }

    window.addEventListener('mousemove', this.mousemoveHandler, { passive: true })
    document.addEventListener('mouseover', this.mouseoverHandler, { passive: true })
    document.addEventListener('mouseout', this.mouseoutHandler, { passive: true })
    document.addEventListener('click', this.clickHandler, { passive: true })
  }

  update() {
    if (this._disposed) return
    // Inner dot — instant follow, centered.
    // Color: accent-hover (idle) → RED (hover) via CSS .is-hover class.
    // Inner dot stays visible (no opacity fade) — just changes color.
    this.innerX = this.targetX
    this.innerY = this.targetY
    // PERF-3 fix: only write DOM when values actually changed (was writing
    // style.transform + classList.toggle every frame even when mouse idle).
    if (this.isStuck !== this._lastIsStuck) {
      this.innerEl.classList.toggle('is-hover', this.isStuck)
      this._lastIsStuck = this.isStuck
    }
    if (this.innerX !== this._lastInnerX || this.innerY !== this._lastInnerY) {
      this.innerEl.style.transform = `translate(${this.innerX}px, ${this.innerY}px) translate(-50%, -50%)`
      this._lastInnerX = this.innerX
      this._lastInnerY = this.innerY
    }

    // Phase 6: spring physics for outer circle (skaltenegger wobble pattern)
    // Goal: magnetic element center (if stuck) or mouse position (if free)
    const goalX = this.isStuck ? this.stuckX : this.targetX
    const goalY = this.isStuck ? this.stuckY : this.targetY
    // Spring-damper: F = -k*(pos - goal) - d*vel
    // Integration: vel += (goal - pos) * stiffness - vel * damping
    const dx = goalX - this.posX
    const dy = goalY - this.posY
    this.velX = (this.velX + dx * this.springStiffness) * this.springDamping
    this.velY = (this.velY + dy * this.springStiffness) * this.springDamping
    this.posX += this.velX
    this.posY += this.velY
    // PERF-3 fix: only write canvas transform when position changed (sub-pixel
    // spring jitter still updates, but idle mouse = no writes).
    if (this.posX !== this._lastCanvasX || this.posY !== this._lastCanvasY) {
      this.canvas.style.transform = `translate(${this.posX}px, ${this.posY}px) translate(-50%, -50%)`
      this._lastCanvasX = this.posX
      this._lastCanvasY = this.posY
    }

    // Radius — smooth expand/shrink + click bump
    const targetR = this.isStuck ? this.targetRadius : this.baseRadius
    this.currentRadius = lerp(this.currentRadius, targetR, 0.12)
    // Bump: lerp bumpScale back to 1 after click
    this.bumpScale = lerp(this.bumpScale, this.bumpTarget, 0.2)

    // Fill progress — 0 = stroke only, 1 = filled
    this.fillProgress = lerp(this.fillProgress, this.fillTarget, 0.12)

    // Draw cursor — ONLY when something changed (avoids redraw when idle)
    const moved =
      Math.abs(this.posX - this._lastDrawX) > 0.3 ||
      Math.abs(this.posY - this._lastDrawY) > 0.3 ||
      Math.abs(this.currentRadius - this._lastDrawR) > 0.3 ||
      Math.abs(this.fillProgress - this._lastDrawFill) > 0.01 ||
      Math.abs(this.bumpScale - this._lastDrawBump) > 0.01 ||
      this.isStuck !== this._lastDrawStuck ||
      this.cursorState !== this._lastDrawState ||
      this._forceRedraw
    if (moved) {
      this.drawCircle()
      this._lastDrawX = this.posX
      this._lastDrawY = this.posY
      this._lastDrawR = this.currentRadius
      this._lastDrawFill = this.fillProgress
      this._lastDrawBump = this.bumpScale
      this._lastDrawStuck = this.isStuck
      this._lastDrawState = this.cursorState
      this._forceRedraw = false
    }
    this.frameCount++
  }

  private drawCircle(): void {
    if (!this.ctx) return
    const ctx = this.ctx
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

    const cx = CANVAS_HALF
    const cy = CANVAS_HALF
    const radius = this.currentRadius * this.bumpScale

    // Phase 2: custom cursor states (data-cursor attribute)
    // Draw different shapes based on cursorState
    if (this.cursorState === 'play') {
      this.drawPlayIcon(ctx, cx, cy, radius)
      return
    }
    if (this.cursorState === 'drag') {
      this.drawDragIcon(ctx, cx, cy, radius)
      return
    }
    if (this.cursorState === 'view') {
      this.drawViewIcon(ctx, cx, cy, radius)
      return
    }

    // Console reticle: thin ring + 4 crosshair ticks at N/E/S/W.
    // Colors read from CSS variables so the cursor follows the active theme
    // (dark console green / light inverse) without hardcoded RGB values.
    const { accent, accentGlow, teal: signalTeal } = this._getThemeColors()

    const alpha = 0.55 + this.fillProgress * 0.35
    ctx.strokeStyle = accent
    ctx.globalAlpha = alpha
    ctx.lineWidth = 1.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    // Noisy distortion only when expanded enough
    const isNoisy = this.isStuck && this.currentRadius > this.baseRadius + 5
    const points = this._ringPoints
    for (let i = 0; i < SMOOTH_SEGMENTS; i++) {
      const angle = (i / SMOOTH_SEGMENTS) * Math.PI * 2
      let segRadius = radius

      if (isNoisy) {
        const noiseX = noise2D(this.frameCount / this.noiseScale, i)
        const noiseY = noise2D(this.frameCount / this.noiseScale, i + 10)
        segRadius += (noiseX + noiseY) * this.noiseRange
      }

      const point = points[i]!
      point.x = cx + Math.cos(angle) * segRadius
      point.y = cy + Math.sin(angle) * segRadius
    }

    // Smoothed ring (quadraticCurveTo midpoint method)
    if (points.length > 0) {
      ctx.beginPath()
      ctx.moveTo(
        (points[0]!.x + points[points.length - 1]!.x) / 2,
        (points[0]!.y + points[points.length - 1]!.y) / 2,
      )
      for (let i = 0; i < points.length; i++) {
        const curr = points[i]!
        const next = points[(i + 1) % points.length]!
        const midX = (curr.x + next.x) / 2
        const midY = (curr.y + next.y) / 2
        ctx.quadraticCurveTo(curr.x, curr.y, midX, midY)
      }
      ctx.closePath()
    }

    // Fill: subtle accent glow on hover
    if (this.fillProgress > 0.01) {
      ctx.fillStyle = accentGlow
      ctx.globalAlpha = this.fillProgress * 0.6
      ctx.fill()
      ctx.globalAlpha = alpha
    }
    ctx.stroke()

    // Console crosshair ticks: 4 short lines at N/E/S/W outside the ring
    const tickLen = 5
    const tickGap = 3
    ctx.strokeStyle = signalTeal
    ctx.globalAlpha = 0.7
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(cx, cy - radius - tickGap)
    ctx.lineTo(cx, cy - radius - tickGap - tickLen)
    ctx.moveTo(cx + radius + tickGap, cy)
    ctx.lineTo(cx + radius + tickGap + tickLen, cy)
    ctx.moveTo(cx, cy + radius + tickGap)
    ctx.lineTo(cx, cy + radius + tickGap + tickLen)
    ctx.moveTo(cx - radius - tickGap, cy)
    ctx.lineTo(cx - radius - tickGap - tickLen, cy)
    ctx.stroke()

    ctx.globalAlpha = 1
  }

  /** Console play icon — accent green circle + triangle. */
  private drawPlayIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
    const { accent, accentGlow: glow } = this._getThemeColors()
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = glow
    ctx.fill()
    ctx.strokeStyle = accent
    ctx.lineWidth = 1.5
    ctx.stroke()
    // Triangle (play icon)
    const size = r * 0.5
    ctx.beginPath()
    ctx.moveTo(cx - size * 0.5, cy - size)
    ctx.lineTo(cx - size * 0.5, cy + size)
    ctx.lineTo(cx + size * 0.8, cy)
    ctx.closePath()
    ctx.fillStyle = accent
    ctx.fill()
  }

  /** Console drag icon — signal teal circle + left-right arrows. */
  private drawDragIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
    const { teal } = this._getThemeColors()
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.strokeStyle = teal
    ctx.globalAlpha = 0.6
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.globalAlpha = 0.9
    const arrowSize = r * 0.4
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    // Left arrow
    ctx.beginPath()
    ctx.moveTo(cx - arrowSize, cy)
    ctx.lineTo(cx - arrowSize * 2, cy)
    ctx.moveTo(cx - arrowSize * 2, cy)
    ctx.lineTo(cx - arrowSize * 1.5, cy - arrowSize * 0.4)
    ctx.moveTo(cx - arrowSize * 2, cy)
    ctx.lineTo(cx - arrowSize * 1.5, cy + arrowSize * 0.4)
    ctx.stroke()
    // Right arrow
    ctx.beginPath()
    ctx.moveTo(cx + arrowSize, cy)
    ctx.lineTo(cx + arrowSize * 2, cy)
    ctx.moveTo(cx + arrowSize * 2, cy)
    ctx.lineTo(cx + arrowSize * 1.5, cy - arrowSize * 0.4)
    ctx.moveTo(cx + arrowSize * 2, cy)
    ctx.lineTo(cx + arrowSize * 1.5, cy + arrowSize * 0.4)
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  /** Console view icon — signal teal circle + eye shape. */
  private drawViewIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
    const { teal } = this._getThemeColors()
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.strokeStyle = teal
    ctx.globalAlpha = 0.6
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.globalAlpha = 0.9
    // Eye shape
    const eyeW = r * 0.9
    const eyeH = r * 0.5
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.ellipse(cx, cy, eyeW, eyeH, 0, 0, Math.PI * 2)
    ctx.stroke()
    // Pupil
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.2, 0, Math.PI * 2)
    ctx.fillStyle = teal
    ctx.fill()
    ctx.globalAlpha = 1
  }

  destroy() {
    if (this._disposed) return
    this._disposed = true
    window.removeEventListener('mousemove', this.mousemoveHandler)
    document.removeEventListener('mouseover', this.mouseoverHandler)
    document.removeEventListener('mouseout', this.mouseoutHandler)
    document.removeEventListener('click', this.clickHandler)
    this.onActivity = null
    this.innerEl.remove()
    this.canvas.remove()
    this.ctx = null
  }
}
