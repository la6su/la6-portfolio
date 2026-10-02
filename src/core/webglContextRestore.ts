/** Wait for a WebGL2 canvas context to return, with owner-controlled cleanup. */
export function waitForWebGLContextRestore(
  canvas: HTMLCanvasElement,
  restoreContext?: { restoreContext(): void },
  signal?: AbortSignal,
  timeoutMs = 5_000,
): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false)

  return new Promise<boolean>((resolve) => {
    let settled = false
    let deferredRestore: number | undefined

    const finish = (restored: boolean): void => {
      if (settled) return
      settled = true
      if (deferredRestore !== undefined) {
        window.clearTimeout(deferredRestore)
        deferredRestore = undefined
      }
      if (restoreContext) canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
      signal?.removeEventListener('abort', onAbort)
      window.clearTimeout(timeout)
      resolve(restored)
    }

    const onLost = (event: Event): void => {
      event.preventDefault()
      if (restoreContext) {
        // Chromium ignores restoreContext() while the loss event is still
        // being dispatched, even after preventDefault() has been called.
        deferredRestore = window.setTimeout(() => {
          deferredRestore = undefined
          if (!settled) restoreContext.restoreContext()
        }, 0)
      }
    }
    const onRestored = (): void => finish(true)
    const onAbort = (): void => finish(false)

    const timeout = window.setTimeout(() => finish(false), timeoutMs)
    if (restoreContext) canvas.addEventListener('webglcontextlost', onLost, { once: true })
    canvas.addEventListener('webglcontextrestored', onRestored, { once: true })
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
