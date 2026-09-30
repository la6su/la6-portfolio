// src/core/bootstrapStates.ts — Phase 3 pure bootstrap state machine.
//
// The target bootstrap is an explicit state machine (docs/ARCHITECTURE.md,
// "Bootstrap and failure handling"):
//
//   shell-painted
//     -> app-loading
//     -> renderer-initializing
//     -> scene-prewarming
//     -> ready
//     -> entered
//
//   any initialization state -> failed -> retry
//
// Device loss after `ready` returns the machine to `failed`; the bounded-
// rebuild policy (one retry per failure, then an explicit failure state) is
// application policy layered on top of this machine, not part of it.
//
// Pure by design: no DOM, timers, renderer or events. `entry-app.ts` owns the
// concrete splash/event side effects and consumes this machine for its
// renderer, scene-prewarm, ready and retry transitions. Unit-testable without
// a browser.

export type BootstrapState =
  | 'shell-painted'
  | 'app-loading'
  | 'renderer-initializing'
  | 'scene-prewarming'
  | 'ready'
  | 'entered'
  | 'failed'

/**
 * The complete transition table. A state that is absent here has no outgoing
 * transitions (the machine is total: every reachable state is listed).
 *
 * - the happy path advances one step at a time;
 * - every initialization state (and `ready`/`entered` for device loss) may
 *   fall to `failed` — "any initialization state -> failed" plus the
 *   post-ready device-loss path;
 * - a retry restarts the sequence from `app-loading`: the shell is already
 *   painted, and the retry disposes the incomplete renderer attempt before a
 *   new one is created (the app re-enters `renderer-initializing` on the
 *   next transition).
 */
const TRANSITIONS: Record<BootstrapState, readonly BootstrapState[]> = {
  'shell-painted': ['app-loading', 'failed'],
  'app-loading': ['renderer-initializing', 'failed'],
  'renderer-initializing': ['scene-prewarming', 'failed'],
  'scene-prewarming': ['ready', 'failed'],
  ready: ['entered', 'failed'],
  entered: ['failed'],
  failed: ['app-loading'],
}

/** True when `next` is a legal transition from `state`. */
export function canTransition(state: BootstrapState, next: BootstrapState): boolean {
  return TRANSITIONS[state].includes(next)
}

/**
 * The next state if the transition is legal, otherwise `null`. Total and
 * side-effect free: an illegal transition is a policy event the caller
 * reports, not an exception.
 */
export function tryTransition(state: BootstrapState, next: BootstrapState): BootstrapState | null {
  return canTransition(state, next) ? next : null
}

/** The entry state: the shell is painted, nothing else is running yet. */
export const INITIAL_BOOTSTRAP_STATE: BootstrapState = 'shell-painted'
