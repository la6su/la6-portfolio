import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockTheaters = vi.hoisted(() => [] as Array<{ open: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }>)

vi.mock('./World/ShowreelTheater', () => ({
  ShowreelTheater: class {
    open = vi.fn()
    close = vi.fn()
    togglePlay = vi.fn()
    dispose = vi.fn()
    update = vi.fn()
    setReducedMotion = vi.fn()
    currentPhase = 'closed'
    isAnimating = false

    constructor() {
      mockTheaters.push(this)
    }
  },
}))

import { eventBus } from '../core/EventBus'
import { ShowreelController } from './ShowreelController'

describe('ShowreelController lazy Tres owner lifecycle', () => {
  beforeEach(() => {
    mockTheaters.length = 0
  })

  it('does not open after a close arrives while the Vue portal is mounting', async () => {
    let resolveMount!: () => void
    const mountTheater = vi.fn(() => new Promise<void>((resolve) => (resolveMount = resolve)))
    const unmountTheater = vi.fn(async () => undefined)
    const controller = new ShowreelController({
      isDestroyed: () => false,
      reducedMotion: () => false,
      mountTheater,
      unmountTheater,
    })
    controller.bind()

    eventBus.emit('jlz:showreel-open')
    eventBus.emit('jlz:showreel-close')
    resolveMount()
    await vi.waitFor(() => expect(mountTheater).toHaveBeenCalledTimes(1))
    await Promise.resolve()

    expect(mockTheaters[0]!.open).not.toHaveBeenCalled()
    controller.dispose()
    await Promise.resolve()
    expect(unmountTheater).toHaveBeenCalledTimes(1)
    expect(mockTheaters[0]!.dispose).toHaveBeenCalledTimes(1)
  })

  it('mounts once and reuses the same portal controller across open cycles', async () => {
    const mountTheater = vi.fn(async () => undefined)
    const unmountTheater = vi.fn(async () => undefined)
    const controller = new ShowreelController({
      isDestroyed: () => false,
      reducedMotion: () => false,
      mountTheater,
      unmountTheater,
    })
    controller.bind()

    eventBus.emit('jlz:showreel-open')
    await vi.waitFor(() => expect(mockTheaters[0]?.open).toHaveBeenCalledTimes(1))
    eventBus.emit('jlz:showreel-close')
    eventBus.emit('jlz:showreel-open')
    await vi.waitFor(() => expect(mockTheaters[0]?.open).toHaveBeenCalledTimes(2))

    expect(mountTheater).toHaveBeenCalledTimes(1)
    expect(mockTheaters).toHaveLength(1)
    controller.dispose()
    await Promise.resolve()
  })
})
