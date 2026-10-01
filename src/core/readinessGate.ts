// src/core/readinessGate.ts — first-render readiness gate.

export interface ReadinessGate {
  /** Resolves only after the first rendered frame. */
  promise: Promise<void>
  /** Mark the initial frame successful. */
  markRendered(): void
  /** Reject the wait when the Experience is destroyed. */
  cancel(): void
}

/**
 * Wait for the first successful frame. A timeout is a startup failure, not a
 * successful readiness signal; cancellation releases the pending continuation.
 */
export function createReadinessGate(timeoutMs: number): ReadinessGate {
  let settled = false
  let resolveGate!: () => void
  let rejectGate!: (error: unknown) => void
  let timeout: ReturnType<typeof setTimeout> | null = null

  const clear = () => {
    if (timeout !== null) {
      clearTimeout(timeout)
      timeout = null
    }
  }
  const succeed = () => {
    if (settled) return
    settled = true
    clear()
    resolveGate()
  }
  const fail = (error: unknown) => {
    if (settled) return
    settled = true
    clear()
    rejectGate(error)
  }

  const promise = new Promise<void>((resolve, reject) => {
    resolveGate = resolve
    rejectGate = reject
    timeout = setTimeout(
      () => fail(new Error(`First render did not complete within ${timeoutMs} ms.`)),
      timeoutMs,
    )
  })

  return {
    promise,
    markRendered: succeed,
    cancel: () => {
      if (settled) return
      fail(new DOMException('Experience initialization was cancelled.', 'AbortError'))
    },
  }
}
