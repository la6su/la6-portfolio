import { describe, expect, it } from 'vitest'

import {
  RenderScheduler,
  type FrameReason,
  type LoopDriver,
  type SchedulerHost,
} from '../core/RenderScheduler'

/** Fake renderer loop: records setLoop calls; the installed callback can be ticked manually. */
class FakeDriver implements LoopDriver {
  private _callback: ((time: number) => void) | null = null
  /** Number of times setLoop was called with a non-null callback (loop starts). */
  starts = 0
  /** Number of times setLoop(null) was called (loop stops). */
  stops = 0

  get active(): boolean {
    return this._callback !== null
  }

  get callback(): ((time: number) => void) | null {
    return this._callback
  }

  setLoop(callback: ((time: number) => void) | null): void {
    this._callback = callback
    if (callback === null) this.stops += 1
    else this.starts += 1
  }

  /** Simulate one renderer-loop tick. */
  tick(time = 16): void {
    this._callback?.(time)
  }
}

interface HostOptions {
  /** Frames the host runs before `isSettled` flips true (Infinity = never settles). */
  settleAfterFrames?: number
}

/** Fake scene host with a scriptable settle threshold. */
class FakeHost implements SchedulerHost {
  frames: number[] = []
  settled = false
  private readonly settleAfterFrames: number

  constructor(options: HostOptions = {}) {
    this.settleAfterFrames = options.settleAfterFrames ?? Infinity
  }

  onFrame(time: number): void {
    this.frames.push(time)
    if (this.frames.length >= this.settleAfterFrames) this.settled = true
  }

  isSettled(): boolean {
    return this.settled
  }
}

function makeScheduler(driver: FakeDriver, host: SchedulerHost): RenderScheduler {
  return new RenderScheduler(driver, host, { autoVisibility: false })
}

describe('RenderScheduler (Phase 7 single loop driver)', () => {
  it('is stopped before the first invalidation', () => {
    const driver = new FakeDriver()
    const scheduler = makeScheduler(driver, new FakeHost())
    expect(driver.active).toBe(false)
    expect(scheduler.diagnostics.loopActive).toBe(false)
  })

  it('starts the loop on the first invalidation and stops after the settled frame', () => {
    const driver = new FakeDriver()
    const host = new FakeHost({ settleAfterFrames: 1 })
    const scheduler = makeScheduler(driver, host)

    scheduler.invalidate('first-frame')
    expect(driver.active).toBe(true)

    driver.tick(16)
    expect(host.frames).toEqual([16])
    // Settled → the loop is cleared after the frame.
    expect(driver.active).toBe(false)
    expect(driver.starts).toBe(1)
    expect(driver.stops).toBe(1)
    expect(scheduler.diagnostics.settledFrames).toBe(1)
  })

  it('keeps the loop while the host is unsettled', () => {
    const driver = new FakeDriver()
    const host = new FakeHost({ settleAfterFrames: 3 })
    const scheduler = makeScheduler(driver, host)

    scheduler.invalidate()
    driver.tick(1)
    expect(driver.active).toBe(true)
    driver.tick(2)
    expect(driver.active).toBe(true)
    driver.tick(3)
    expect(driver.active).toBe(false)
    expect(host.frames).toEqual([1, 2, 3])
    expect(driver.stops).toBe(1)
  })

  it('coalesces invalidations while the loop is running', () => {
    const driver = new FakeDriver()
    const host = new FakeHost({ settleAfterFrames: 2 })
    const scheduler = makeScheduler(driver, host)

    scheduler.invalidate('nav')
    scheduler.invalidate('cursor')
    scheduler.invalidate('breath')
    expect(driver.starts).toBe(1)

    driver.tick()
    driver.tick()
    expect(driver.active).toBe(false)
    expect(host.frames).toHaveLength(2)
  })

  it('restarts the loop when an invalidation lands after the settled stop', () => {
    const driver = new FakeDriver()
    const host = new FakeHost({ settleAfterFrames: 1 })
    const scheduler = makeScheduler(driver, host)

    scheduler.invalidate('first-frame')
    driver.tick()
    expect(driver.active).toBe(false)

    host.settled = false
    host.frames.length = 0
    scheduler.invalidate('nav')
    expect(driver.active).toBe(true)
    expect(driver.starts).toBe(2)
    driver.tick()
    expect(driver.active).toBe(false)
  })

  it('pauses on hidden and folds hidden invalidations into the single resume invalidation', () => {
    const driver = new FakeDriver()
    const host = new FakeHost({ settleAfterFrames: Infinity })
    const scheduler = makeScheduler(driver, host)

    scheduler.invalidate('first-frame')
    expect(driver.active).toBe(true)

    scheduler.setHidden(true)
    expect(driver.active).toBe(false)

    // Invalidations while hidden must not start the loop.
    scheduler.invalidate('breath')
    scheduler.invalidate('nav')
    expect(driver.active).toBe(false)
    expect(driver.starts).toBe(1)

    scheduler.setHidden(false)
    expect(driver.active).toBe(true)
    // Exactly one resume invalidation — the two hidden ones are folded in.
    expect(scheduler.diagnostics.lastInvalidation).toBe('visibility-resume')
    host.settled = true
    driver.tick()
    expect(driver.active).toBe(false)
    expect(driver.starts).toBe(2)
  })

  it('causes exactly one invalidation on resume even without pending work', () => {
    const driver = new FakeDriver()
    const host = new FakeHost({ settleAfterFrames: 1 })
    const scheduler = makeScheduler(driver, host)

    // Never started; go hidden, then resume.
    scheduler.setHidden(true)
    scheduler.setHidden(false)
    expect(driver.active).toBe(true)
    expect(scheduler.diagnostics.lastInvalidation).toBe('visibility-resume')
    driver.tick()
    expect(driver.active).toBe(false)
    expect(driver.starts).toBe(1)
    expect(driver.stops).toBe(1)
  })

  it('ignores repeated visibility state', () => {
    const driver = new FakeDriver()
    const host = new FakeHost({ settleAfterFrames: 1 })
    const scheduler = makeScheduler(driver, host)

    scheduler.setHidden(true)
    scheduler.setHidden(true)
    expect(driver.starts).toBe(0)

    scheduler.setHidden(false)
    scheduler.setHidden(false)
    // Only the first false → true-resume transition invalidated.
    expect(driver.starts).toBe(1)
  })

  it('settleNow stops the active loop immediately', () => {
    const driver = new FakeDriver()
    const host = new FakeHost({ settleAfterFrames: Infinity })
    const scheduler = makeScheduler(driver, host)

    scheduler.invalidate('first-frame')
    expect(driver.active).toBe(true)

    scheduler.settleNow()
    expect(driver.active).toBe(false)
    expect(driver.stops).toBe(1)

    // A later invalidation can still restart (reduced motion only settles the
    // current window, it does not disable the driver).
    host.settled = true
    scheduler.invalidate('breath')
    driver.tick()
    expect(host.frames).toHaveLength(1)
  })

  it('destroy stops the loop and makes the scheduler inert', () => {
    const driver = new FakeDriver()
    const host = new FakeHost({ settleAfterFrames: Infinity })
    const scheduler = makeScheduler(driver, host)

    scheduler.invalidate()
    scheduler.destroy()
    expect(driver.active).toBe(false)

    scheduler.invalidate()
    expect(driver.active).toBe(false)
    expect(driver.starts).toBe(1)
  })

  it('ignores a callback already captured before destroy', () => {
    const driver = new FakeDriver()
    const host = new FakeHost({ settleAfterFrames: Infinity })
    const scheduler = makeScheduler(driver, host)

    scheduler.invalidate()
    const captured = driver.callback
    scheduler.destroy()
    captured?.(99)

    expect(host.frames).toHaveLength(0)
    expect(scheduler.diagnostics.frames).toBe(0)
  })

  it('ignores a callback captured before the loop settled', () => {
    const driver = new FakeDriver()
    const host = new FakeHost({ settleAfterFrames: 1 })
    const scheduler = makeScheduler(driver, host)

    scheduler.invalidate()
    const captured = driver.callback
    driver.tick(16)
    captured?.(32)

    expect(host.frames).toEqual([16])
    expect(scheduler.diagnostics.settledFrames).toBe(1)
  })

  it('passes the driver time through to the host frame', () => {
    const driver = new FakeDriver()
    const host = new FakeHost({ settleAfterFrames: 2 })
    const scheduler = makeScheduler(driver, host)

    scheduler.invalidate()
    driver.tick(100)
    driver.tick(200)
    expect(host.frames).toEqual([100, 200])
  })

  it('records typed reasons in diagnostics', () => {
    const driver = new FakeDriver()
    const host = new FakeHost({ settleAfterFrames: 1 })
    const scheduler = makeScheduler(driver, host)

    scheduler.invalidate('resize')
    expect(scheduler.diagnostics.lastInvalidation).toBe('resize')
    driver.tick()

    host.settled = false
    scheduler.invalidate('recovery')
    expect(scheduler.diagnostics.lastInvalidation).toBe('recovery')
    driver.tick()
    expect(scheduler.diagnostics.frames).toBe(2)
  })

  it('stops after a host exception and allows a later retry', () => {
    const driver = new FakeDriver()
    let attempts = 0
    const host: SchedulerHost = {
      onFrame: () => {
        attempts += 1
        if (attempts === 1) throw new Error('frame failed')
      },
      isSettled: () => attempts > 1,
    }
    const scheduler = makeScheduler(driver, host)

    scheduler.invalidate('dirty')
    driver.tick()
    expect(driver.active).toBe(false)
    expect(scheduler.diagnostics.loopActive).toBe(false)

    scheduler.invalidate('recovery')
    expect(driver.starts).toBe(2)
    driver.tick()
    expect(driver.active).toBe(false)
  })
})

/** Reasons are a closed, typed union. The `satisfies Record<FrameReason, true>`
 * pin makes a new variant a type error here until it is listed. */
const ALL_REASONS: FrameReason[] = Object.keys({
  'first-frame': true,
  dirty: true,
  breath: true,
  nav: true,
  cursor: true,
  resize: true,
  'motion-preference': true,
  'visibility-resume': true,
  recovery: true,
  external: true,
} satisfies Record<FrameReason, true>) as FrameReason[]
it('FrameReason covers the typed activity contract', () => {
  expect(ALL_REASONS).toHaveLength(new Set(ALL_REASONS).size)
})
