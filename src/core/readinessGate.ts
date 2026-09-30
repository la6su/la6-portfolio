// src/core/readinessGate.ts — first-render readiness gate.
//
// Pure timing helper: wraps the "first successful render" promise with a
// bounded timeout. Cancellation deliberately leaves the promise pending: a
// destroyed Experience must never let entry-app publish readiness.
// Extracted from Experience.ts so the boot contract lives beside the other
// bootstrap policy modules (bootstrapStates, renderDemand) instead of inside
// the scene runtime.

export interface ReadinessGate {
  /** Resolves on the first rendered frame or at the timeout, whichever first. */
  promise: Promise<void>
  /** Abandon the gate without resolving (destroyed Experience). */
  cancel(): void
}

/**
 * Wait for the first successful frame without leaving a fallback timer armed
 * after the gate has settled.
 */
export function createReadinessGate(firstRender: Promise<void>, timeoutMs: number): ReadinessGate {
  let settled = false
  let resolveGate!: () => void
  let timeout: ReturnType<typeof setTimeout> | null = null

  const clear = () => {
    if (timeout !== null) {
      clearTimeout(timeout)
      timeout = null
    }
  }
  const settle = () => {
    if (settled) return
    settled = true
    clear()
    resolveGate()
  }

  const promise = new Promise<void>((resolve) => {
    resolveGate = resolve
    timeout = setTimeout(settle, timeoutMs)
    void firstRender.then(settle, settle)
  })

  return {
    promise,
    cancel: () => {
      if (settled) return
      settled = true
      clear()
    },
  }
}
