// src/Experience/LazyStage.ts — generic lazy-stage lifecycle core.
//
// Every route-owned stage (works plane, contact typography/halo/cyprus,
// manifesto ink) used to repeat the same ~30-line ensure/dispose flow inside
// Experience: request counter, promise memoization, stale-guard, attach,
// post-init wiring, failure containment with an exact per-stage release
// order. This module owns that flow once over the owner-backed slots in
// StageRegistry. The route-specific contracts stay with that registry.
//
// The per-stage variation is expressed as a contract:
//   create   — construct directly or after a dynamic import
//   load     — optional awaitable init after the instance joins the scene
//   configure— route wiring applied once the stale guard passes
//   attach   — scene insertion
//   release  — teardown in the exact per-stage order (dispose ↔ detach)
//   onDispose— extra invalidation (e.g. the Cyprus active flag)

import type { Object3D } from 'three'

/** Function-backed view over the state held by one lazy-stage slot. */
export interface LazyStageOwner<T> {
  getStage: () => T | null
  setStage: (stage: T | null) => void
  getPromise: () => Promise<void> | null
  setPromise: (promise: Promise<void> | null) => void
  /** Live request id, for stale guards. */
  getRequest: () => number
  /** Invalidate any in-flight creation; returns the new request id. */
  advanceRequest: () => number
}

/** Owner-backed slot: the three lazy-stage fields (stage reference, memoized
 *  init promise, request id) that every route-owned stage used to keep
 *  hand-copied on Experience. The slot owns them once; Experience keeps one
 *  slot field per stage and hands `slot.owner` to its contract, so a new
 *  lazy stage is one field + one contract instead of a field triple plus an
 *  11-line owner adapter. */
export interface LazyStageSlot<T> {
  /** The LazyStageOwner view for a LazyStageContract. */
  readonly owner: LazyStageOwner<T>
  /** Current stage reference (null until created / after dispose). */
  getStage(): T | null
  /** Set the stage reference (test seeding; production writes go through the contract flow). */
  setStage(stage: T | null): void
  /** Live request id, for external stale guards (e.g. the Cyprus section flip). */
  getRequest(): number
}

export function createLazyStageSlot<T>(): LazyStageSlot<T> {
  let stage: T | null = null
  let promise: Promise<void> | null = null
  let request = 0
  const owner: LazyStageOwner<T> = {
    getStage: () => stage,
    setStage: (value) => {
      stage = value
    },
    getPromise: () => promise,
    setPromise: (value) => {
      promise = value
    },
    getRequest: () => request,
    advanceRequest: () => ++request,
  }
  return {
    owner,
    getStage: () => stage,
    setStage: (value) => {
      stage = value
    },
    getRequest: () => request,
  }
}

export interface LazyStageContract<T extends Object3D> {
  /** DEV diagnostic label, e.g. `'WorksPlaneStage'`. */
  label: string
  /** Mutable owner state (a {@link createLazyStageSlot} instance). */
  owner: LazyStageOwner<T>
  /**
   * Produce the instance — synchronously, or after a dynamic import. The
   * factory receives the request guard so a dynamic-import continuation can
   * avoid constructing GPU resources after its owner was retired.
   */
  create: (isCurrent: () => boolean) => T | null | Promise<T | null>
  /** Attach the instance to the scene; Tres-backed mounts may be awaitable. */
  attach: (stage: T) => void | Promise<void>
  /** Optional awaitable init/load after the instance is attached. */
  load?: (stage: T, isCurrent: () => boolean) => Promise<unknown>
  /** Route wiring after the stale guard passes. */
  configure: (stage: T) => void
  /** Release resources in the exact per-stage order (dispose ↔ detach). */
  release: (stage: T) => void
  /** Extra invalidation when the owner is disposed. */
  onDispose?: () => void
}

/**
 * Build a {@link LazyStageContract.create} that constructs the stage after a
 * dynamic import. The request guard is applied AFTER the import resolves —
 * an import continuation must never construct GPU resources for a retired
 * request. One helper instead of one hand-copied lambda per stage.
 */
export function createImportedLazyStage<T extends Object3D, M>(
  load: () => Promise<M>,
  pick: (module: M) => new () => T,
): (isCurrent: () => boolean) => Promise<T | null> {
  return (isCurrent) => load().then((module) => (isCurrent() ? new (pick(module))() : null))
}

/**
 * Lazily create, attach, load and wire one stage. The returned promise
 * resolves after configure() (never rejects — failure is contained) and is
 * memoized until the stage settles, fails or is disposed.
 */
export function ensureLazyStage<T extends Object3D>(contract: LazyStageContract<T>): Promise<void> {
  const { owner } = contract
  const memoized = owner.getPromise()
  if (memoized) return memoized
  const request = owner.advanceRequest()

  const fail = (error: unknown, stage: T | null): void => {
    if (stage) contract.release(stage)
    if (request === owner.getRequest()) {
      owner.setStage(null)
      owner.setPromise(null)
    }
    if (import.meta.env.DEV) {
      console.error(`[Experience] ${contract.label} init failed:`, error)
    }
  }

  const settle = (stage: T): void => {
    if (request !== owner.getRequest() || owner.getStage() !== stage) {
      // The route disposed this stage while its init was still in flight.
      // Release the late result too, so resources created after the first
      // dispose are freed as well.
      contract.release(stage)
      return
    }
    contract.configure(stage)
  }

  // Calling attach before the first await preserves Works' eager mount.
  // The same guard now applies to synchronous and imported stages: a Tres
  // mount may finish after route leave and must not start asset loading.
  const attachAndLoad = (stage: T): Promise<T> => {
    owner.setStage(stage)
    try {
      const attached = contract.attach(stage)
      const loadIfCurrent = (): Promise<unknown> | undefined => {
        if (request === owner.getRequest() && owner.getStage() === stage) {
          return contract.load?.(
            stage,
            () => request === owner.getRequest() && owner.getStage() === stage,
          )
        }
      }
      // A synchronous attach starts its load immediately, as Works did
      // before consolidation; an async Tres mount checks the request again.
      const loaded = attached instanceof Promise ? attached.then(loadIfCurrent) : loadIfCurrent()
      return Promise.resolve(loaded).then(() => stage)
    } catch (error) {
      return Promise.reject(error)
    }
  }

  let created: T | null | Promise<T | null>
  try {
    created = contract.create(() => request === owner.getRequest())
  } catch (error) {
    fail(error, null)
    return Promise.resolve()
  }

  let activeStage: T | null = null
  const mount = (stage: T | null): Promise<T | null> => {
    if (!stage) return Promise.resolve(null)
    if (request !== owner.getRequest()) {
      contract.release(stage)
      return Promise.resolve(null)
    }
    activeStage = stage
    return attachAndLoad(stage)
  }
  const pending = created instanceof Promise ? created.then(mount) : mount(created)
  const settled = pending.then(
    (stage) => {
      if (!stage) {
        if (request === owner.getRequest()) owner.setPromise(null)
        return
      }
      try {
        settle(stage)
      } catch (error) {
        fail(error, stage)
      }
    },
    (error: unknown) => fail(error, activeStage),
  )
  owner.setPromise(settled)
  return settled
}

/**
 * Dispose the stage, invalidate any in-flight creation and reset the owner
 * state so a later ensure re-creates it from scratch.
 */
export function disposeLazyStage<T extends Object3D>(contract: LazyStageContract<T>): void {
  const { owner } = contract
  owner.advanceRequest()
  const stage = owner.getStage()
  if (stage) {
    contract.release(stage)
    owner.setStage(null)
  }
  owner.setPromise(null)
  contract.onDispose?.()
}
