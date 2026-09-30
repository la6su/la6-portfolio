// src/core/ErrorTracker.ts — Zero-dependency error tracking.
// Logs errors to console with dedup. The sendBeacon infra was removed —
// __ERROR_ENDPOINT__ / __BUILD_VERSION__ were never set (no Vite define,
// no window assignment), so the prod sendBeacon path was dead code.
const sent = new Set<string>()
let rejectionHandler: ((event: PromiseRejectionEvent) => void) | null = null
let errorHandler: ((event: ErrorEvent) => void) | null = null

export const ErrorTracker = {
  report: (error: Error | string, context?: Record<string, unknown>) => {
    const message = typeof error === 'string' ? error : error.message
    const key = message.slice(0, 100)
    if (sent.has(key)) return
    sent.add(key)
    console.error('[ErrorTracker]', message, context ?? '')
  },

  // A-10/D-24 fix: guard against double-init (HMR re-evaluates the module,
  // init() would add duplicate window listeners without this flag).
  _initialized: false,
  init: function () {
    if (ErrorTracker._initialized) return
    ErrorTracker._initialized = true
    rejectionHandler = (e) => {
      e.preventDefault()
      ErrorTracker.report(e.reason as Error, { source: 'unhandledrejection' })
    }

    errorHandler = (e) => {
      // Suppress benign ResizeObserver loop error — this is a browser
      // limitation, not a real bug. The observation completes next frame.
      const msg = e.error?.message ?? e.message ?? 'Unknown error'
      if (msg.includes('ResizeObserver loop')) return
      ErrorTracker.report(new Error(msg), {
        source: 'window.error',
        filename: e.filename ?? '',
        lineno: e.lineno ?? 0,
        colno: e.colno ?? 0,
      })
    }
    window.addEventListener('unhandledrejection', rejectionHandler)
    window.addEventListener('error', errorHandler)
  },

  dispose: function () {
    if (rejectionHandler) window.removeEventListener('unhandledrejection', rejectionHandler)
    if (errorHandler) window.removeEventListener('error', errorHandler)
    rejectionHandler = null
    errorHandler = null
    ErrorTracker._initialized = false
    sent.clear()
  },
}
