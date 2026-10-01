// src/Experience/LazyStage.ts — generic lazy-stage lifecycle core.
//
// Every route-owned stage (works plane, contact typography/halo/cyprus,
// manifesto ink) used to repeat the same ~30-line ensure/dispose flow inside
// Experience: request counter, promise memoization, stale-guard, attach,
// post-init wiring, failure containment with an exact per-stage release
// order. This module owns that flow once over the stage owners in
// StageRegistry. The route-specific contracts stay with that registry.
//
// The per-stage variation is expressed as a contract:
//   create   — construct directly or after a dynamic import
//   load     — optional awaitable init after the instance joins the scene
//   configure— route wiring applied once the stale guard passes
//   attach   — scene insertion
//   release  — teardown in the exact per-stage order (dispose ↔ detach)
//   onDispose— extra invalidation (e.g. the Cyprus active flag)

import { traceDevLifecycle } from '../core/devLifecycleTrace'

/** Mutable lifecycle state and terminal cleanup owner for one lazy stage. */
export interface LazyStageOwner<T> {
  /** Current instance and memoized ensure flow. */
  stage: T | null
  promise: Promise<void> | null
  /** Invalidates all async continuations from earlier requests. */
  request: number
  /** Run terminal cleanup at most once and expose its completion. */
  release: (stage: T, cleanup: (stage: T) => void | Promise<void>) => Promise<void>
  /** Wait for every release already started by this stage owner. */
  waitForReleases: () => Promise<void>
}

/** One route-stage owner; state is plain data, cleanup behavior lives here. */
export function createLazyStageOwner<T extends object>(): LazyStageOwner<T> {
  const releases = new WeakMap<object, Promise<void>>()
  const pendingReleases = new Set<Promise<void>>()
  return {
    stage: null,
    promise: null,
    request: 0,
    release: (value, cleanup) => {
      const existing = releases.get(value)
      if (existing) return existing

      let complete!: () => void
      const completion = new Promise<void>((resolve) => {
        complete = resolve
      })
      releases.set(value, completion)
      pendingReleases.add(completion)
      void completion.then(() => pendingReleases.delete(completion))
      try {
        void Promise.resolve(cleanup(value)).then(complete, complete)
      } catch {
        complete()
      }
      return completion
    },
    waitForReleases: () => Promise.all([...pendingReleases]).then(() => undefined),
  }
}

export interface LazyStageContract<T extends object> {
  /** DEV diagnostic label, e.g. `'WorksPlaneStage'`. */
  label: string
  /** Mutable owner state (a {@link createLazyStageOwner} instance). */
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
  release: (stage: T) => void | Promise<void>
  /** Extra invalidation when the owner is disposed. */
  onDispose?: () => void
}

/**
 * Build a {@link LazyStageContract.create} that constructs the stage after a
 * dynamic import. The request guard is applied AFTER the import resolves —
 * an import continuation must never construct GPU resources for a retired
 * request. One helper instead of one hand-copied lambda per stage.
 */
export function createImportedLazyStage<T extends object, M>(
  load: () => Promise<M>,
  pick: (module: M) => new () => T,
): (isCurrent: () => boolean) => Promise<T | null> {
  return (isCurrent) => load().then((module) => (isCurrent() ? new (pick(module))() : null))
}

function releaseLazyStage<T extends object>(
  contract: LazyStageContract<T>,
  stage: T,
): Promise<void> {
  return contract.owner.release(stage, async (value) => {
    try {
      await contract.release(value)
      if (import.meta.env.DEV) {
        traceDevLifecycle(`scene-stage:${contract.label}:released`)
      }
    } catch (error: unknown) {
      console.error(`[Experience] ${contract.label} release failed:`, error)
    }
  })
}

/**
 * Lazily create, attach, load and wire one stage. The returned promise
 * resolves after configure() (never rejects — failure is contained) and is
 * memoized until the stage settles, fails or is disposed.
 */
export function ensureLazyStage<T extends object>(contract: LazyStageContract<T>): Promise<void> {
  const { owner } = contract
  const release = (stage: T): Promise<void> => releaseLazyStage(contract, stage)
  const memoized = owner.promise
  if (memoized) return memoized
  const request = ++owner.request

  const fail = async (error: unknown, stage: T | null): Promise<void> => {
    if (stage) await release(stage)
    if (request === owner.request) {
      owner.stage = null
      owner.promise = null
    }
    if (import.meta.env.DEV) {
      console.error(`[Experience] ${contract.label} init failed:`, error)
    }
  }

  const settle = async (stage: T): Promise<void> => {
    if (request !== owner.request || owner.stage !== stage) {
      // The route disposed this stage while its init was still in flight.
      // Release the late result too, so resources created after the first
      // dispose are freed as well.
      await release(stage)
      return
    }
    contract.configure(stage)
    if (import.meta.env.DEV) {
      traceDevLifecycle(`scene-stage:${contract.label}:ready`)
    }
  }

  // Calling attach before the first await preserves Works' eager mount.
  // The same guard now applies to synchronous and imported stages: a Tres
  // mount may finish after route leave and must not start asset loading.
  const attachAndLoad = (stage: T): Promise<T> => {
    owner.stage = stage
    try {
      const attached = contract.attach(stage)
      const loadIfCurrent = (): Promise<unknown> | undefined => {
        if (request === owner.request && owner.stage === stage) {
          return contract.load?.(
            stage,
            () => request === owner.request && owner.stage === stage,
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
    created = contract.create(() => request === owner.request)
  } catch (error) {
    fail(error, null)
    return Promise.resolve()
  }

  let activeStage: T | null = null
  const mount = (stage: T | null): Promise<T | null> => {
    if (!stage) return Promise.resolve(null)
    if (request !== owner.request) {
      return release(stage).then(() => null)
    }
    activeStage = stage
    return attachAndLoad(stage)
  }
  const pending = created instanceof Promise ? created.then(mount) : mount(created)
  const settled = pending.then(
    async (stage) => {
      if (!stage) {
        if (request === owner.request) owner.promise = null
        return
      }
      try {
        await settle(stage)
      } catch (error) {
        await fail(error, stage)
      }
    },
    (error: unknown) => fail(error, activeStage),
  )
  owner.promise = settled
  return settled
}

/**
 * Dispose the stage, invalidate any in-flight creation and reset the owner
 * state so a later ensure re-creates it from scratch.
 */
export function disposeLazyStage<T extends object>(
  contract: LazyStageContract<T>,
): Promise<void> {
  const { owner } = contract
  owner.request++
  const stage = owner.stage
  const release = stage ? releaseLazyStage(contract, stage) : owner.waitForReleases()
  if (stage) owner.stage = null
  owner.promise = null
  contract.onDispose?.()
  // Let a create() continuation already queued for this turn reach mount().
  // It may have produced a stage just before disposal but not assigned it to
  // the owner yet; mount() will see the stale request and register its release.
  return Promise.resolve().then(() =>
    Promise.all([release, owner.waitForReleases()]).then(() => undefined),
  )
}
