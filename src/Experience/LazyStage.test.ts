import { describe, expect, it, vi } from 'vitest'
import { createLazyStageOwner, disposeLazyStage, ensureLazyStage } from './LazyStage'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

describe('lazy stage teardown', () => {
  it('releases once when disposal races an asynchronous host mount', async () => {
    const slot = createLazyStageOwner<{ dispose(): void }>()
    const mounted = deferred<void>()
    const dispose = vi.fn()
    const stage: { dispose(): void } = { dispose }
    const contract = {
      label: 'pending mount',
      owner: slot,
      create: () => stage,
      attach: () => mounted.promise,
      configure: vi.fn(),
      release: (value: typeof stage) => value.dispose(),
    }

    const initialization = ensureLazyStage(contract)
    disposeLazyStage(contract)
    mounted.resolve()
    await initialization

    expect(dispose).toHaveBeenCalledTimes(1)
    expect(contract.configure).not.toHaveBeenCalled()
  })

  it('waits for declared-node detachment before disposing an async release', async () => {
    const slot = createLazyStageOwner<{ dispose(): void }>()
    const mounted = deferred<void>()
    const detached = deferred<void>()
    const events: string[] = []
    const stage: { dispose(): void } = {
      dispose: () => {
        events.push('dispose')
      },
    }
    const contract = {
      label: 'async release',
      owner: slot,
      create: () => stage,
      attach: () => mounted.promise,
      configure: vi.fn(),
      release: async (value: typeof stage) => {
        events.push('detach')
        await detached.promise
        value.dispose()
      },
    }

    const initialization = ensureLazyStage(contract)
    const disposal = disposeLazyStage(contract)
    const repeatedDisposal = disposeLazyStage(contract)
    expect(events).toEqual(['detach'])

    mounted.resolve()
    await Promise.resolve()
    expect(events).toEqual(['detach'])
    expect(contract.configure).not.toHaveBeenCalled()

    detached.resolve()
    await Promise.all([initialization, disposal, repeatedDisposal])

    expect(events).toEqual(['detach', 'dispose'])
    expect(contract.configure).not.toHaveBeenCalled()
  })

  it('keeps a replacement stage when a disposed stage load fails late', async () => {
    const slot = createLazyStageOwner<{ dispose(): void }>()
    const lateLoad = deferred<void>()
    const firstDispose = vi.fn()
    const secondDispose = vi.fn()
    const firstStage: { dispose(): void } = { dispose: firstDispose }
    const secondStage: { dispose(): void } = { dispose: secondDispose }
    let creations = 0
    const configure = vi.fn()
    const release = vi.fn((stage: { dispose(): void }) => stage.dispose())
    const contract = {
      label: 'late route load',
      owner: slot,
      create: () => (creations++ === 0 ? firstStage : secondStage),
      attach: () => undefined,
      load: (stage: { dispose(): void }) =>
        stage === firstStage ? lateLoad.promise : Promise.resolve(),
      configure,
      release,
    }

    const firstInitialization = ensureLazyStage(contract)
    await disposeLazyStage(contract)
    expect(firstDispose).toHaveBeenCalledTimes(1)

    const secondInitialization = ensureLazyStage(contract)
    await secondInitialization
    expect(slot.stage).toBe(secondStage)

    lateLoad.reject(new Error('late asset failure'))
    await firstInitialization

    expect(slot.stage).toBe(secondStage)
    expect(release).toHaveBeenCalledTimes(1)
    expect(release).toHaveBeenCalledWith(firstStage)
    expect(secondDispose).not.toHaveBeenCalled()
    expect(configure).toHaveBeenCalledTimes(1)
    expect(configure).toHaveBeenCalledWith(secondStage)
  })

  it('releases a stage once when its dynamic import resolves after disposal', async () => {
    const slot = createLazyStageOwner<{ dispose(): void }>()
    const imported = deferred<{ dispose(): void }>()
    const dispose = vi.fn()
    const stage: { dispose(): void } = { dispose }
    const contract = {
      label: 'pending import',
      owner: slot,
      create: () => imported.promise,
      attach: vi.fn(),
      configure: vi.fn(),
      release: (value: typeof stage) => value.dispose(),
    }

    const initialization = ensureLazyStage(contract)
    disposeLazyStage(contract)
    imported.resolve(stage)
    await initialization

    expect(dispose).toHaveBeenCalledTimes(1)
    expect(contract.attach).not.toHaveBeenCalled()
    expect(contract.configure).not.toHaveBeenCalled()
  })

  it('waits for a late stage mount to detach before teardown completes', async () => {
    const slot = createLazyStageOwner<{ dispose(): void }>()
    const imported = deferred<{ dispose(): void }>()
    const detached = deferred<void>()
    const dispose = vi.fn()
    const stage: { dispose(): void } = { dispose }
    let teardown!: Promise<void>
    const contract = {
      label: 'creation before mount',
      owner: slot,
      create: () =>
        imported.promise.then((value) => {
          queueMicrotask(() => {
            teardown = disposeLazyStage(contract)
          })
          return value
        }),
      attach: vi.fn(),
      configure: vi.fn(),
      release: async (value: typeof stage) => {
        await detached.promise
        value.dispose()
      },
    }

    const initialization = ensureLazyStage(contract)
    imported.resolve(stage)
    while (!teardown) await Promise.resolve()

    let teardownFinished = false
    void teardown.then(() => {
      teardownFinished = true
    })
    await Promise.resolve()
    expect(teardownFinished).toBe(false)
    expect(dispose).not.toHaveBeenCalled()

    detached.resolve()
    await Promise.all([initialization, teardown])
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(contract.attach).not.toHaveBeenCalled()
  })

  it('releases a stale async creation without disturbing a replacement stage', async () => {
    const slot = createLazyStageOwner<{ dispose(): void }>()
    const staleCreation = deferred<{ dispose(): void }>()
    const staleDispose = vi.fn()
    const replacementDispose = vi.fn()
    const staleStage = { dispose: staleDispose }
    const replacement = { dispose: replacementDispose }
    let creations = 0
    const configure = vi.fn()
    const contract = {
      label: 'replacement during creation',
      owner: slot,
      create: () => (creations++ === 0 ? staleCreation.promise : replacement),
      attach: vi.fn(),
      configure,
      release: (stage: { dispose(): void }) => stage.dispose(),
    }

    const staleInitialization = ensureLazyStage(contract)
    await disposeLazyStage(contract)
    const replacementInitialization = ensureLazyStage(contract)
    await replacementInitialization

    staleCreation.resolve(staleStage)
    await staleInitialization

    expect(staleDispose).toHaveBeenCalledTimes(1)
    expect(replacementDispose).not.toHaveBeenCalled()
    expect(slot.stage).toBe(replacement)
    expect(configure).toHaveBeenCalledTimes(1)
    expect(configure).toHaveBeenCalledWith(replacement)
  })
})
