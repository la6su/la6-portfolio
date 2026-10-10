import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockTheaters = vi.hoisted(
  () => [] as Array<{ open: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }>,
)
const disposeOrder = vi.hoisted(() => [] as string[])

vi.mock('../../../src/Experience/World/ShowreelTheater', () => ({
  ShowreelTheater: class {
    open = vi.fn()
    close = vi.fn()
    togglePlay = vi.fn()
    dispose = vi.fn(() => disposeOrder.push('media-disposed'))
    update = vi.fn()
    setReducedMotion = vi.fn()
    currentPhase = 'closed'
    isAnimating = false

    constructor() {
      mockTheaters.push(this)
    }
  },
}))

import { eventBus } from '../../../src/core/EventBus'
import { ShowreelController } from '../../../src/Experience/ShowreelController'

describe('ShowreelController lazy Tres owner lifecycle', () => {
  beforeEach(() => {
    mockTheaters.length = 0
    disposeOrder.length = 0
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
    await controller.dispose()
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
    await controller.dispose()
  })

  it('disposes media before awaiting the Vue portal unmount', async () => {
    let finishUnmount!: () => void
    const mountTheater = vi.fn(async () => undefined)
    const unmountTheater = vi.fn(() => {
      disposeOrder.push('portal-unmount')
      return new Promise<void>((resolve) => (finishUnmount = resolve))
    })
    const controller = new ShowreelController({
      isDestroyed: () => false,
      reducedMotion: () => false,
      mountTheater,
      unmountTheater,
    })
    controller.bind()

    eventBus.emit('jlz:showreel-open')
    await vi.waitFor(() => expect(mockTheaters[0]?.open).toHaveBeenCalledOnce())
    const teardown = controller.dispose()

    expect(disposeOrder).toEqual(['media-disposed', 'portal-unmount'])
    finishUnmount()
    await teardown
  })
})
