import { afterEach, describe, expect, it, vi } from 'vitest'
import { createReadinessGate } from './readinessGate'

describe('first-render readiness gate', () => {
  afterEach(() => vi.useRealTimers())

  it('resolves only when the first successful render completes', async () => {
    vi.useFakeTimers()
    let render!: () => void
    const firstRender = new Promise<void>((resolve) => {
      render = resolve
    })
    const gate = createReadinessGate(firstRender, 20_000)

    render()
    await expect(gate.promise).resolves.toBeUndefined()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects on timeout instead of reporting the scene ready', async () => {
    vi.useFakeTimers()
    const gate = createReadinessGate(new Promise<void>(() => {}), 20_000)
    const rejection = expect(gate.promise).rejects.toThrow(
      'First render did not complete within 20000 ms.',
    )

    await vi.advanceTimersByTimeAsync(20_000)
    await rejection
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects a cancelled wait and clears its timeout', async () => {
    vi.useFakeTimers()
    const gate = createReadinessGate(new Promise<void>(() => {}), 20_000)
    const rejection = expect(gate.promise).rejects.toMatchObject({ name: 'AbortError' })

    gate.cancel()
    await rejection
    expect(vi.getTimerCount()).toBe(0)
  })
})
