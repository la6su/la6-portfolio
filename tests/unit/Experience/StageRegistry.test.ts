import { describe, expect, it, vi } from 'vitest'
import type { SceneStagePorts } from '../../../src/Experience/SceneHostContract'
import { ContactCyprusStage } from '../../../src/Experience/World/ContactCyprusStage'
import { StageRegistry } from '../../../src/Experience/StageRegistry'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('StageRegistry resource teardown', () => {
  it('reconciles lazy route resources in their registry owner', async () => {
    const registry = new StageRegistry({
      currentPage: () => 'services',
      camera: {} as never,
      viewport: () => ({ width: 1280, height: 720 }),
      host: {} as SceneStagePorts,
      isContactLight: () => false,
      reducedMotion: () => false,
      syncRouteVisuals: vi.fn(),
    })
    const disposals = [
      vi.spyOn(registry, 'disposeWorksPlaneStage').mockResolvedValue(),
      vi.spyOn(registry, 'disposeContactTypographyStage').mockResolvedValue(),
      vi.spyOn(registry, 'disposeContactCyprusStage').mockResolvedValue(),
      vi.spyOn(registry, 'disposeContactHaloStage').mockResolvedValue(),
      vi.spyOn(registry, 'disposeManifestoInkStage').mockResolvedValue(),
    ]
    const disposeLab = vi.spyOn(registry, 'disposeLabGamepad')

    await registry.reconcileRoute('services')

    for (const dispose of disposals) expect(dispose).toHaveBeenCalledOnce()
    expect(disposeLab).not.toHaveBeenCalled()
  })

  it('owns Cyprus activation for the contact section', () => {
    const stage = new ContactCyprusStage()
    const setActive = vi.spyOn(stage, 'setActive')
    const registry = new StageRegistry({
      currentPage: () => 'contact',
      camera: {} as never,
      viewport: () => ({ width: 1280, height: 720 }),
      host: {} as SceneStagePorts,
      isContactLight: () => false,
      reducedMotion: () => false,
      syncRouteVisuals: vi.fn(),
    })
    registry.owners.contactCyprus.stage = stage

    registry.setContactCyprusStageSection(2)
    registry.setContactCyprusStageSection(1)

    expect(setActive).toHaveBeenNthCalledWith(1, true)
    expect(setActive).toHaveBeenNthCalledWith(2, false)
  })

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
      camera: {} as never,
      viewport: () => ({ width: 1280, height: 720 }),
      host: ports,
      isContactLight: () => false,
      reducedMotion: () => false,
      syncRouteVisuals: vi.fn(),
    })
    const stage = new ContactCyprusStage()
    const dispose = vi.spyOn(stage, 'dispose').mockImplementation(() => {
      events.push('dispose')
    })
    registry.owners.contactCyprus.stage = stage

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
