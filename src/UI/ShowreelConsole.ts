// ShowreelConsole.ts — DOM chrome for the showreel theater.
//
// The GPU-side theater (ShowreelTheater, owned by Experience) renders the
// film through the shared pipeline; this owner owns the persistent console
// chrome that floats above it: the signal readout line, the timecode/progress
// strip. It also owns the interaction contract while
// the theater is open — Esc to close, Space to toggle playback, suppressed
// wheel/touch navigation, focus in and back out.
//
// Ownership: UIManager creates and disposes one instance. All theater
// communication flows over the typed eventBus (`jlz:showreel-*`), so the DOM
// layer never touches the GPU layer directly.

import { eventBus } from '../core/EventBus'
import type { ShowreelState } from '../Experience/World/ShowreelTheater'

/** UIkit-free mono clock: m:ss. */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export class ShowreelConsole {
  private root: HTMLElement | null = null
  private timeEl: HTMLElement | null = null
  private durationEl: HTMLElement | null = null
  private phaseEl: HTMLElement | null = null
  private progressEl: HTMLElement | null = null
  private playStateEl: HTMLElement | null = null
  private liveEl: HTMLElement | null = null

  private restoreFocus: HTMLElement | null = null
  private lastPhase: ShowreelState['phase'] = 'closed'
  private lastPlaying = false

  private readonly listeners = new AbortController()
  private readonly unsubs: Array<() => void> = []

  private readonly onState = (state: ShowreelState): void => {
    if (state.phase === this.lastPhase && state.playing === this.lastPlaying) {
      this.syncMedia(state.time, state.duration)
      return
    }
    const wasClosed = this.lastPhase === 'closed'
    const wasOpen = this.lastPhase !== 'closed'
    this.lastPhase = state.phase
    this.lastPlaying = state.playing
    if (state.phase === 'closed') {
      this.hideChrome()
      this.announce('Showreel closed')
      return
    }
    if (wasClosed) this.showChrome()
    if (wasOpen && state.phase === 'open') this.announce('Showreel playing')
    this.syncPhase(state.phase, state.playing)
    this.syncMedia(state.time, state.duration)
  }

  private readonly onKeydown = (e: KeyboardEvent): void => {
    if (this.lastPhase === 'closed') return
    // stopImmediatePropagation keeps CinematicNav's window-level story
    // navigation from reacting behind the theater (FullscreenOverlay's
    // documented pattern).
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopImmediatePropagation()
      this.requestClose()
    } else if (e.key === ' ') {
      e.preventDefault()
      e.stopImmediatePropagation()
      eventBus.emit('jlz:showreel-toggle-play')
    }
  }

  constructor() {
    this.unsubs.push(eventBus.on('jlz:showreel-state', this.onState))
    this.unsubs.push(
      eventBus.on('jlz:close-media-layer', () => {
        if (this.lastPhase !== 'closed') this.requestClose()
      }),
    )
    document.addEventListener('keydown', this.onKeydown, { signal: this.listeners.signal })
  }

  /** Wire the showreel trigger delegation. Call once per init. */
  wireTrigger(): void {
    document.addEventListener(
      'click',
      (e) => {
        const target = e.target as HTMLElement
        if (!target.closest('#jlz-showreel-trigger')) return
        e.preventDefault()
        this.requestOpen()
      },
      { signal: this.listeners.signal },
    )
  }

  dispose(): void {
    this.listeners.abort()
    for (const unsub of this.unsubs) unsub()
    this.unsubs.length = 0
    if (this.lastPhase !== 'closed') {
      eventBus.emit('jlz:fullscreen-change', { open: false })
      document.body.classList.remove('jlz-media-layer-open')
    }
    this.root?.remove()
    this.root = null
  }

  // ── Internals ──

  private requestOpen(): void {
    if (document.activeElement instanceof HTMLElement) {
      this.restoreFocus = document.activeElement
    }
    eventBus.emit('jlz:showreel-open')
  }

  private requestClose(): void {
    eventBus.emit('jlz:showreel-close')
  }

  private showChrome(): void {
    const root = this.ensureRoot()
    root.dataset.state = 'open'
    root.setAttribute('role', 'region')
    root.setAttribute('aria-label', 'Showreel theater status')
    eventBus.emit('jlz:close-nav')
    eventBus.emit('jlz:fullscreen-change', { open: true })
    document.body.classList.add('jlz-media-layer-open')
    // The persistent menu launcher is the shared exit for all media layers.
    document.getElementById('jlz-menu-launcher')?.focus({ preventScroll: true })
  }

  private hideChrome(): void {
    if (this.root) this.root.dataset.state = 'closed'
    eventBus.emit('jlz:fullscreen-change', { open: false })
    document.body.classList.remove('jlz-media-layer-open')
    this.restoreFocus?.focus({ preventScroll: true })
    this.restoreFocus = null
  }

  private announce(text: string): void {
    if (this.liveEl) this.liveEl.textContent = text
  }

  private syncPhase(phase: ShowreelState['phase'], playing: boolean): void {
    if (this.phaseEl) {
      this.phaseEl.textContent =
        phase === 'open'
          ? playing
            ? 'SIGNAL LOCKED'
            : 'HOLD'
          : phase === 'exit'
            ? 'CLOSING'
            : 'ACQUIRING'
    }
    if (this.playStateEl) this.playStateEl.textContent = playing ? 'PLAY' : 'PAUSE'
  }

  private syncMedia(time: number, duration: number): void {
    if (this.timeEl) this.timeEl.textContent = formatTime(time)
    if (this.durationEl) this.durationEl.textContent = formatTime(duration)
    if (this.progressEl) {
      const pct = duration > 0 ? Math.min(100, (time / duration) * 100) : 0
      this.progressEl.style.setProperty('--jlz-showreel-progress', `${pct}%`)
    }
  }

  private ensureRoot(): HTMLElement {
    if (this.root?.isConnected) return this.root
    const root = document.createElement('div')
    root.id = 'jlz-showreel-console'
    root.className = 'jlz-showreel-console'
    root.dataset.state = 'closed'
    root.setAttribute('data-no-magnetic', '')

    root.innerHTML = `
      <header class="jlz-showreel-console__meta">
        <span class="jlz-showreel-console__signal" aria-hidden="true"></span>
        <span class="jlz-showreel-console__name">SHOWREEL.MP4</span>
        <span class="jlz-showreel-console__phase" aria-hidden="true">ACQUIRING</span>
        <span class="jlz-showreel-console__sr" aria-live="polite"></span>
      </header>
      <footer class="jlz-showreel-console__status" aria-hidden="true">
        <span class="jlz-showreel-console__state">HOLD</span>
        <span class="jlz-showreel-console__track">
          <span class="jlz-showreel-console__progress"></span>
        </span>
        <span class="jlz-showreel-console__time">
          <span class="jlz-showreel-console__time-now">0:00</span>
          /
          <span class="jlz-showreel-console__time-total">0:00</span>
        </span>
      </footer>
    `

    // The theater surface itself toggles playback: clicks that miss the
    // chrome controls reach the film through this transparent backdrop.
    root.addEventListener(
      'click',
      (e) => {
        if (e.target === root) eventBus.emit('jlz:showreel-toggle-play')
      },
      { signal: this.listeners.signal },
    )
    // While the theater owns the viewport, wheel/touch gestures must not
    // drive the story track behind it.
    const swallow = (e: Event) => {
      e.preventDefault()
      e.stopPropagation()
    }
    root.addEventListener('wheel', swallow, { passive: false, signal: this.listeners.signal })
    root.addEventListener('touchmove', swallow, { passive: false, signal: this.listeners.signal })

    document.body.appendChild(root)
    this.root = root
    this.phaseEl = root.querySelector('.jlz-showreel-console__phase')
    this.playStateEl = root.querySelector('.jlz-showreel-console__state')
    this.progressEl = root.querySelector('.jlz-showreel-console__progress')
    this.timeEl = root.querySelector('.jlz-showreel-console__time-now')
    this.durationEl = root.querySelector('.jlz-showreel-console__time-total')
    this.liveEl = root.querySelector('.jlz-showreel-console__sr')

    return root
  }
}
