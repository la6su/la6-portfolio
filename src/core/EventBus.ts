// Typed event bus — replaces untyped window.dispatchEvent(CustomEvent) calls.
// Compile-time safety on event payloads; no DOM dependency; `on()` returns
// an unsubscribe function for cleaner lifecycle management.

import type { ThemeAppliedPort } from './sectionTheme'
import type { ThemeMode } from './ThemeManager'

export interface AppEvents {
  /** ExperienceRuntime begins scene preparation after SceneHost readiness. */
  'jlz:experience-starting': void
  /** Fired by the Vue runtime owner after Experience's first successful draw. */
  'jlz:experience-ready': void
  /** Fired by entry-app.ts after ExperienceRuntime completes the first draw. */
  'jlz:webgl-ready': void
  /** Fired by ExperienceRuntime when scene or runtime initialization fails. */
  'jlz:webgl-failed': void
  /** Fired by Experience.update() on section index change — drives ContentReveal + NoiseText. */
  'jlz:section-change': {
    sectionId: string
    context?: string
    configId?: string
    index: number
  }
  /** Fired after route DOM is ready — reconciles route-owned runtime features. */
  'jlz:route-change': void
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
  'jlz:page-section-change': { index: number; sectionId: string }
  /** Persistent Vue shell requests a story-track section. */
  'jlz:story-navigate': { index: number }
  /** CinematicNav updates the persistent shell's active section state. */
  'jlz:story-index-change': { index: number }
  /** Fired by FullscreenOverlay on prev/next project navigation. */
  'jlz:project-navigate': { direction: -1 | 1 }
  /** Fullscreen media becomes the active interaction layer. */
  'jlz:fullscreen-change': { open: boolean }
  /** Requests that the active fullscreen media owner closes itself. */
  'jlz:close-media-layer': void
  /** Vue removed the persistent fullscreen overlay host from AppShell. */
  'jlz:fullscreen-overlay-unmounted': void
  /** Fired by a persistent sound control. */
  'jlz:sound-toggle': { muted: boolean }
  /** Fired by the index.html splash Enter control. */
  'jlz:splash-entered': void
  /** Fired by ContentReveal after the per-section theme has been applied. */
  'jlz:theme-applied': ThemeAppliedPort
  /** Fired by core/ThemeManager when the theme mode changes. */
  'jlz:theme-change': { mode: ThemeMode }
  /** Fired by BakuCarousel on a card wobble tap. */
  'jlz:wobble-pulse': void
  /** Fired by ShowreelConsole.vue when its trigger requests the theater. */
  'jlz:showreel-open': void
  /** Fired by the shared media exit or Esc to exit the showreel theater. */
  'jlz:showreel-close': void
  /** Fired by ShowreelConsole.vue or Space key to toggle playback. */
  'jlz:showreel-toggle-play': void
  /**
   * Fired by the ShowreelTheater whenever its observable state changes
   * (phase transitions, play/pause, video timeupdate). ShowreelConsole.vue is
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

  /** Subscribe to an event. Returns an idempotent disposer for this listener. */
  on<K extends keyof AppEvents>(event: K, cb: Handler<K>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    const listeners = this.listeners.get(event)!
    const handler = cb as (payload: unknown) => void
    listeners.add(handler)
    let active = true
    return () => {
      if (!active) return
      active = false
      listeners.delete(handler)
      if (listeners.size === 0) this.listeners.delete(event)
    }
  }

  /** Emit a typed event to all subscribers. */
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
}

/** Singleton instance — import this, not the class. */
export const eventBus = new EventBus()

// HMR disabled — import.meta.hot triggers Vite to inject @vite/client
// which breaks module loading through the reverse proxy.
