/** Record lifecycle events only when a development test explicitly subscribes. */
export function traceDevLifecycle(event: string): void {
  if (!import.meta.env.DEV) return
  window.__jlzTestLifecycleTrace?.push(event)
}
