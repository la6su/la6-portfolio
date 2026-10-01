import { describe, expect, it, vi } from 'vitest'
import type { SceneStagePorts } from '../app/sceneHost'
import { ContactCyprusStage } from './World/ContactCyprusStage'
import { StageRegistry } from './StageRegistry'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('StageRegistry resource teardown', () => {
  it('waits for the Vue host to detach a route stage before disposing it', async () => {
    const detached = deferred<void>()
    const events: string[] = []
    const ports = {
      contactCyprus: {
        mount: vi.fn(),
        unmount: vi.fn(async () => {
          events.push('unmount-start')
          await detached.promise
          events.push('unmount-complete')
        }),
      },
    } as unknown as SceneStagePorts
    const registry = new StageRegistry({
      currentPage: () => 'contact',
      camera: () => ({ instance: {} as never }),
      host: () => ports,
      isContactLight: () => false,
      isCyprusActive: () => true,
      setCyprusActive: vi.fn(),
      reducedMotion: () => false,
      syncRouteVisuals: vi.fn(),
    })
    const stage = new ContactCyprusStage()
    const dispose = vi.spyOn(stage, 'dispose').mockImplementation(() => {
      events.push('dispose')
    })
    registry.slots.contactCyprus.setStage(stage)

    const teardown = registry.disposeContactCyprusStage()
    const finalTeardown = registry.dispose()

    expect(events).toEqual(['unmount-start'])
    expect(dispose).not.toHaveBeenCalled()

    detached.resolve()
    await Promise.all([teardown, finalTeardown])

    expect(events).toEqual(['unmount-start', 'unmount-complete', 'dispose'])
    expect(dispose).toHaveBeenCalledTimes(1)
  })
})
