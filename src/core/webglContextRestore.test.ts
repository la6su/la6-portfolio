import { afterEach, describe, expect, it, vi } from 'vitest'
import { waitForWebGLContextRestore } from './webglContextRestore'

afterEach(() => vi.useRealTimers())

describe('waitForWebGLContextRestore', () => {
  it('resolves after the canvas reports a restored context', async () => {
    const canvas = new EventTarget() as HTMLCanvasElement
    const waiting = waitForWebGLContextRestore(canvas, undefined, undefined, 50)

    canvas.dispatchEvent(new Event('webglcontextrestored'))

    await expect(waiting).resolves.toBe(true)
  })

  it('removes listeners and timeout immediately when the owner aborts', async () => {
    vi.useFakeTimers()
    const canvas = new EventTarget() as HTMLCanvasElement
    const controller = new AbortController()
    const removeListener = vi.spyOn(canvas, 'removeEventListener')
    const waiting = waitForWebGLContextRestore(canvas, undefined, controller.signal)

    controller.abort()

    await expect(waiting).resolves.toBe(false)
    expect(removeListener).toHaveBeenCalledWith('webglcontextrestored', expect.any(Function))
    expect(vi.getTimerCount()).toBe(0)
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    await vi.advanceTimersByTimeAsync(5_000)
    expect(vi.getTimerCount()).toBe(0)
  })
})
