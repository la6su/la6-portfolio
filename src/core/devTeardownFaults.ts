/** Test-only teardown fault injection (dev harness for the host-teardown spec). */
export type TeardownFault = () => unknown

/**
 * Owner-keyed disposer stand-ins registered by the dedicated teardown spec.
 * A fault either throws synchronously (sync owners) or returns a rejected
 * promise (the async-captured owners `showreel` / `route stages` /
 * `renderer`). Inert outside dev mode and when no spec registers faults.
 */
export function readDevTeardownFaults(): Record<string, TeardownFault> | null {
  if (!import.meta.env.DEV) return null
  return window.__jlzTestTeardownFaults ?? null
}
