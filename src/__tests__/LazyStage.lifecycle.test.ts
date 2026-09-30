import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  disposeLazyStage,
  ensureLazyStage,
  type LazyStageContract,
  type LazyStageOwner,
} from '../Experience/LazyStage'

// The lazy-stage lifecycle core behind Experience's route-owned stages:
// memoization, stale-guard release, failure containment and retry. The
// Experience wiring uses owner-backed slots; these tests drive the same flow
// on a plain owner bag.

interface FakeStage extends THREE.Object3D {
  init: () => Promise<void>
  load: () => Promise<void>
  dispose: () => void
}

function makeStage(): FakeStage {
  const stage = new THREE.Group() as unknown as FakeStage
  stage.init = vi.fn(async () => undefined)
  stage.load = vi.fn(async () => undefined)
  stage.dispose = vi.fn()
  return stage
}

function makeOwner<T>(): LazyStageOwner<T> {
  const state: { stage: T | null; promise: Promise<void> | null; request: number } = {
    stage: null,
    promise: null,
    request: 0,
  }
  return {
    getStage: () => state.stage,
    setStage: (stage) => {
      state.stage = stage
    },
    getPromise: () => state.promise,
    setPromise: (promise) => {
      state.promise = promise
    },
    getRequest: () => state.request,
    advanceRequest: () => ++state.request,
  }
}

function makeContract<T extends THREE.Object3D>(
  owner: LazyStageOwner<T>,
  overrides: Partial<LazyStageContract<T>> = {},
): LazyStageContract<T> {
  return {
    label: 'FakeStage',
    owner,
    create: () => makeStage() as unknown as T,
    attach: vi.fn((stage: T) => scene.add(stage)),
    configure: vi.fn(),
    release: vi.fn((stage: T) => {
      stage.removeFromParent()
    }),
    ...overrides,
  } as LazyStageContract<T>
}

const scene = new THREE.Scene()

afterEach(() => {
  scene.clear()
})

describe('ensureLazyStage (synchronous creation)', () => {
  it('attaches before the first await and configures after init', async () => {
    const owner = makeOwner<FakeStage>()
    const contract = makeContract(owner)
    const pending = ensureLazyStage(contract)
    // Eager-attach contract: the stage joins the scene synchronously.
    expect(owner.getStage()).not.toBeNull()
    expect(owner.getStage()?.parent).toBe(scene)
    await pending
    expect(contract.configure).toHaveBeenCalledTimes(1)
  })

  it('releases a stage that finishes after the owner was disposed', async () => {
    const owner = makeOwner<FakeStage>()
    let resolveInit!: () => void
    const contract = makeContract(owner, {
      load: () => new Promise<void>((resolve) => (resolveInit = resolve)),
    })

    const pending = ensureLazyStage(contract)
    disposeLazyStage(contract)
    resolveInit()
    await pending

    // First release from dispose, second for resources created by the
    // in-flight init after the dispose.
    expect(contract.release).toHaveBeenCalledTimes(2)
    expect(owner.getStage()).toBeNull()
    expect(owner.getPromise()).toBeNull()
  })

  it('does not load a synchronously created stage after its mount is retired', async () => {
    const owner = makeOwner<FakeStage>()
    let finishAttach!: () => void
    const load = vi.fn(async () => undefined)
    const contract = makeContract(owner, {
      attach: () => new Promise<void>((resolve) => (finishAttach = resolve)),
      load,
    })

    const pending = ensureLazyStage(contract)
    expect(owner.getStage()).not.toBeNull()
    disposeLazyStage(contract)
    finishAttach()
    await pending

    expect(load).not.toHaveBeenCalled()
    expect(contract.configure).not.toHaveBeenCalled()
    expect(contract.release).toHaveBeenCalledTimes(2)
  })

  it('contains an init failure and permits a later retry', async () => {
    const owner = makeOwner<FakeStage>()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const contract = makeContract(owner, {
      load: vi.fn<() => Promise<void>>().mockRejectedValueOnce(new Error('fixture init failure')),
    })

    try {
      await expect(ensureLazyStage(contract)).resolves.toBeUndefined()
      expect(owner.getStage()).toBeNull()
      expect(owner.getPromise()).toBeNull()
      expect(contract.release).toHaveBeenCalledTimes(1)

      await ensureLazyStage(contract)
      expect(contract.configure).toHaveBeenCalledTimes(1)
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('contains a synchronous construction failure and permits retry', async () => {
    const owner = makeOwner<FakeStage>()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const create = vi
      .fn<() => FakeStage>()
      .mockImplementationOnce(() => {
        throw new Error('fixture construction failure')
      })
      .mockImplementationOnce(makeStage)
    const contract = makeContract(owner, { create })

    try {
      await expect(ensureLazyStage(contract)).resolves.toBeUndefined()
      expect(owner.getPromise()).toBeNull()
      await ensureLazyStage(contract)
      expect(contract.configure).toHaveBeenCalledTimes(1)
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('contains a configure failure the same way', async () => {
    const owner = makeOwner<FakeStage>()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const contract = makeContract(owner)
    ;(contract.configure as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('fixture configure failure')
    })

    try {
      await expect(ensureLazyStage(contract)).resolves.toBeUndefined()
      expect(contract.release).toHaveBeenCalledTimes(1)
      expect(owner.getStage()).toBeNull()
      expect(owner.getPromise()).toBeNull()
    } finally {
      errorSpy.mockRestore()
    }
  })
})

describe('ensureLazyStage (asynchronous creation)', () => {
  it('allows a later attempt when a current factory has no stage', async () => {
    const owner = makeOwner<FakeStage>()
    const create = vi
      .fn<() => Promise<FakeStage | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeStage())
    const contract = makeContract(owner, { create })

    await ensureLazyStage(contract)
    expect(owner.getPromise()).toBeNull()
    await ensureLazyStage(contract)
    expect(create).toHaveBeenCalledTimes(2)
    expect(contract.configure).toHaveBeenCalledTimes(1)
  })

  it('discards a late construction after the owner was disposed', async () => {
    const owner = makeOwner<FakeStage>()
    let releaseImport!: () => void
    const contract = makeContract(owner, {
      create: () =>
        new Promise<FakeStage>((resolve) => {
          releaseImport = () => resolve(makeStage())
        }),
    })

    const pending = ensureLazyStage(contract)
    expect(owner.getStage()).toBeNull()
    disposeLazyStage(contract)
    releaseImport()
    await pending

    expect(contract.attach).not.toHaveBeenCalled()
    expect(contract.configure).not.toHaveBeenCalled()
    expect(contract.release).toHaveBeenCalledTimes(1)
    expect(owner.getStage()).toBeNull()
  })

  it('releases exactly the attached stage when its load fails', async () => {
    const owner = makeOwner<FakeStage>()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const first = makeStage()
    const contract = makeContract(owner, {
      create: () => Promise.resolve(first),
      load: vi.fn<() => Promise<void>>().mockRejectedValueOnce(new Error('fixture load failure')),
    })

    try {
      await expect(ensureLazyStage(contract)).resolves.toBeUndefined()
      expect(owner.getStage()).toBeNull()
      expect(owner.getPromise()).toBeNull()
      expect(contract.release).toHaveBeenCalledWith(first)

      // Retry creates a fresh instance and configures it.
      await ensureLazyStage(contract)
      expect(contract.configure).toHaveBeenCalledTimes(1)
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('does not load a stage disposed while an async attach is pending', async () => {
    const owner = makeOwner<FakeStage>()
    let finishAttach!: () => void
    const load = vi.fn(async () => undefined)
    const contract = makeContract(owner, {
      create: () => Promise.resolve(makeStage()),
      attach: () =>
        new Promise<void>((resolve) => {
          finishAttach = resolve
        }),
      load,
    })

    const pending = ensureLazyStage(contract)
    await Promise.resolve()
    disposeLazyStage(contract)
    finishAttach()
    await pending

    expect(load).not.toHaveBeenCalled()
    expect(contract.configure).not.toHaveBeenCalled()
    expect(owner.getStage()).toBeNull()
    expect(contract.release).toHaveBeenCalledTimes(2)
  })

  it('does not configure a stale load result after a dispose cycle', async () => {
    const owner = makeOwner<FakeStage>()
    const loads: Array<(value: void) => void> = []
    const contract = makeContract(owner, {
      load: () => new Promise<void>((resolve) => loads.push(resolve)),
    })

    const first = ensureLazyStage(contract)
    await Promise.resolve()
    expect(owner.getStage()).not.toBeNull()
    disposeLazyStage(contract)

    const second = ensureLazyStage(contract)
    await Promise.resolve()
    loads[1]?.()
    await second
    expect(contract.configure).toHaveBeenCalledTimes(1)

    // The old load settling late must not configure anything.
    loads[0]?.()
    await first
    expect(contract.configure).toHaveBeenCalledTimes(1)
  })
})

describe('disposeLazyStage', () => {
  it('releases, resets state and runs the extra invalidation', async () => {
    const owner = makeOwner<FakeStage>()
    const onDispose = vi.fn()
    const contract = makeContract(owner, { onDispose })

    const pending = ensureLazyStage(contract)
    disposeLazyStage(contract)

    expect(contract.release).toHaveBeenCalledTimes(1)
    expect(owner.getStage()).toBeNull()
    expect(owner.getPromise()).toBeNull()
    expect(onDispose).toHaveBeenCalledTimes(1)
    // The in-flight load resolving after dispose must not resurrect anything.
    await pending
    expect(contract.configure).not.toHaveBeenCalled()
  })

  it('is safe to call with no live stage', () => {
    const owner = makeOwner<FakeStage>()
    const contract = makeContract(owner)
    disposeLazyStage(contract)
    expect(contract.release).not.toHaveBeenCalled()
    expect(owner.getRequest()).toBe(1)
  })
})
