// Typed event bus — replaces untyped window.dispatchEvent(CustomEvent) calls.
// Compile-time safety on event payloads; no DOM dependency; `on()` returns
// an unsubscribe function for cleaner lifecycle management.
//
// Phase 10: every `jlz:*` consumer is on this bus. The former window
// dispatchEvent bridge in emit() is removed — `AppEvents` is the single
// port surface (the splash in index.html and the e2e dev seam are the only
// non-module dispatch sites, both through this bus).

import type { ThemeAppliedPort } from './sectionTheme'
import type { ThemeMode } from './ThemeManager'

export interface AppEvents {
  /** Fired by entry-app.ts when the shared runtime is ready. */
  'jlz:webgl-ready': void
  /** Fired by entry-app.ts when Experience.init() fails; keeps Enter unavailable. */
  'jlz:webgl-failed': void
  /** Fired by Experience.update() on section index change — drives ContentReveal + NoiseText. */
  'jlz:section-change': {
    sectionId: string
    context?: string
    configId?: string
    index: number
  }
  /** Fired by useJlzPage on page navigation — triggers UIMenu page active + slider labels. */
  'jlz:route-change': { page?: string }
  /**
   * Fired by Renderer after a bounded WebGPU device-loss recovery re-created
   * the renderer. The PMREM environment texture dies with the lost device, so
   * Experience re-runs setupEnvironment() to bind a fresh one.
   */
  'jlz:renderer-recovered': void
  /** Fired by the nav template / UI controls when the cinematic menu panel must close. */
  'jlz:close-nav': void
  /** Fired by the router after a `#section-*` hash settles — the 3D nav owner activates that section. */
  'jlz:goto-section-by-hash': { hash: string }
  /** Fired by core/i18n after the active language is switched + persisted. */
  'jlz:lang-change': { lang: string }
  /** Fired by a UI control or test seam to request strict in-app navigation. */
  'jlz:navigate': { path: string }
  /** Fired by a semantic project control on a Works or case-study page. */
  'jlz:open-project': { idx: number }
  /** Fired by CinematicNav when a non-home page's active section changes. */
  'jlz:page-section-change': { index: number; count: number }
  /** Fired by FullscreenOverlay on prev/next project navigation. */
  'jlz:project-navigate': { direction: -1 | 1 }
  /** Fullscreen media becomes the active interaction layer. */
  'jlz:fullscreen-change': { open: boolean }
  /** Requests that the active fullscreen media owner closes itself. */
  'jlz:close-media-layer': void
  /** Fired by the UIMenu sound button. */
  'jlz:sound-toggle': { muted: boolean }
  /** Fired by the index.html splash Enter control. */
  'jlz:splash-entered': void
  /** Fired by ContentReveal after the per-section theme has been applied. */
  'jlz:theme-applied': ThemeAppliedPort
  /** Fired by core/ThemeManager when the theme mode changes. */
  'jlz:theme-change': { mode: ThemeMode }
  /** Fired by BakuCarousel on a card wobble tap. */
  'jlz:wobble-pulse': void
  /** Fired by ShowreelConsole when the showreel trigger requests the theater. */
  'jlz:showreel-open': void
  /** Fired by the shared media exit or Esc to exit the showreel theater. */
  'jlz:showreel-close': void
  /** Fired by ShowreelConsole (video surface / Space) to toggle playback. */
  'jlz:showreel-toggle-play': void
  /**
   * Fired by the ShowreelTheater whenever its observable state changes
   * (phase transitions, play/pause, video timeupdate). ShowreelConsole is
   * the chrome consumer; nothing else should listen.
   */
  'jlz:showreel-state': {
    phase: 'closed' | 'enter' | 'open' | 'exit'
    playing: boolean
    time: number
    duration: number
  }
}

type Handler<K extends keyof AppEvents> = (payload: AppEvents[K]) => void

class EventBus {
  // Stored as Set<Function> internally — type safety is enforced at the
  // on()/emit() call boundaries via generic signatures. (TypeScript mapped
  // type variance prevents a directly-typed { [K]: Set<Handler<K>> } storage.)
  private listeners = new Map<keyof AppEvents, Set<(payload: unknown) => void>>()

  /** Subscribe to an event. Returns an unsubscribe function. */
  on<K extends keyof AppEvents>(event: K, cb: Handler<K>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(cb as (payload: unknown) => void)
    return () => this.off(event, cb)
  }

  /** Unsubscribe from an event. */
  off<K extends keyof AppEvents>(event: K, cb: Handler<K>): void {
    this.listeners.get(event)?.delete(cb as (payload: unknown) => void)
  }

  /** Emit an event to all subscribers.
   *  Phase 10: the window dispatchEvent bridge is removed — every consumer
   *  subscribes through this bus (the raw `jlz:*` window listeners were
   *  migrated to typed ports in the Phase 10 slice). */
  emit<K extends keyof AppEvents>(
    event: K,
    ...args: AppEvents[K] extends void ? [] : [AppEvents[K]]
  ): void {
    const set = this.listeners.get(event)
    if (set) {
      // Dispatch the current subscriber snapshot. A handler may tear down its
      // owner (and call off()/clear()) while the event is in flight; that must
      // not silently skip siblings already subscribed to this dispatch.
      for (const cb of [...set]) cb(args[0])
    }
  }

  /** Remove all listeners (for HMR / teardown). */
  clear(): void {
    this.listeners.clear()
  }
}

/** Singleton instance — import this, not the class. */
export const eventBus = new EventBus()

// HMR disabled — import.meta.hot triggers Vite to inject @vite/client
// which breaks module loading through the reverse proxy.
