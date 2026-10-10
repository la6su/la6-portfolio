import UIkit from 'uikit'

/**
 * The app's single typed UIkit port.
 *
 * `@types/uikit` is narrower than the runtime it describes:
 * - `update` is declared as an `object`, but it is a callable.
 * - `util.on` is declared as returning `void`, but the runtime returns its own
 *   release function (`() => off(targets, types, listener)`). That return value
 *   is the only way a behavior controller can drop listeners from an element it
 *   does not own — the fullscreen overlay host belongs to AppShell and outlives
 *   the controller that registers modal handlers on it.
 *
 * The members are re-declared through `Omit`, not an intersection: an
 * intersection keeps the incorrect declaration as the first overload, so
 * `util.on(...)` would still type as `void`.
 */
type UIkitTyped = Omit<typeof UIkit, 'update' | 'util'> & {
  update(element?: Element): void
  util: {
    /** Registers a UIkit event listener and returns its release function. */
    on(element: HTMLElement, type: string, listener: (event: Event) => void): () => void
    off(element: HTMLElement, type: string, listener: (event: Event) => void): void
    [key: string]: unknown
  }
}

export default UIkit as UIkitTyped
