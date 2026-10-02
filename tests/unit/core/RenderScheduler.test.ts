import { afterEach, describe, expect, it, vi } from 'vitest'
import { RenderScheduler } from '../../../src/core/RenderScheduler'

describe('RenderScheduler', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reports a failed frame, stops its loop, and retries on the next invalidation', () => {
    const failure = new Error('scene owner failed')
    const setLoop = vi.fn<(callback: ((deltaMs: number) => void) | null) => void>()
    const onFrame = vi.fn(() => {
      throw failure
    })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const scheduler = new RenderScheduler(
      { setLoop },
      { onFrame, isSettled: () => false },
      { autoVisibility: false },
    )

    scheduler.invalidate()
    const firstFrame = setLoop.mock.calls[0]?.[0]
    expect(firstFrame).toBeTypeOf('function')

    firstFrame?.(16)

    expect(log).toHaveBeenCalledWith('[RenderScheduler] frame failed; loop stopped.', failure)
    expect(scheduler.diagnostics.loopActive).toBe(false)
    expect(setLoop).toHaveBeenLastCalledWith(null)

    scheduler.invalidate('recovery')
    expect(scheduler.diagnostics.loopActive).toBe(true)
    expect(setLoop).toHaveBeenLastCalledWith(expect.any(Function))

    scheduler.destroy()
  })
})
