import { afterEach, describe, expect, it, vi } from 'vitest'
import { createReadinessGate } from '../core/readinessGate'

describe('Experience readiness gate', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('clears the fallback timer after the first successful render', async () => {
    vi.useFakeTimers()
    let resolveFirstRender!: () => void
    const firstRender = new Promise<void>((resolve) => {
      resolveFirstRender = resolve
    })
    const gate = createReadinessGate(firstRender, 20_000)

    expect(vi.getTimerCount()).toBe(1)
    resolveFirstRender()
    await gate.promise

    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps readiness pending when destroyed before the first render', async () => {
    vi.useFakeTimers()
    let resolveFirstRender!: () => void
    const firstRender = new Promise<void>((resolve) => {
      resolveFirstRender = resolve
    })
    const gate = createReadinessGate(firstRender, 20_000)
    let settled = false
    void gate.promise.then(() => {
      settled = true
    })

    gate.cancel()
    expect(vi.getTimerCount()).toBe(0)
    resolveFirstRender()
    await Promise.resolve()

    expect(settled).toBe(false)
  })

  it('retains the bounded timeout fallback', async () => {
    vi.useFakeTimers()
    const gate = createReadinessGate(new Promise<void>(() => {}), 20_000)

    vi.advanceTimersByTime(20_000)
    await gate.promise

    expect(vi.getTimerCount()).toBe(0)
  })
})
