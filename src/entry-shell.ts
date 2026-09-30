// Minimal shell entry: keep first paint path tiny, then lazy-load full app.
// Errors are surfaced to console + ErrorTracker (not silently swallowed).

// Sync reduced-motion dataset SYNCHRONOUSLY at shell load — before any
// dynamic import. entry-app.ts re-syncs later (idempotent), but if the lazy
// bootstrap crashes or times out in headless, the dataset is still correct.
// CSS hooks + E2E tests rely on documentElement.dataset.reducedMotion.
;((): void => {
  try {
    const reduce =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false
    document.documentElement.dataset.reducedMotion = reduce ? '1' : '0'
  } catch {
    /* matchMedia unavailable — dataset stays unset, app still boots */
  }
})()

const startApp = () =>
  import('./entry-app')
    .then((m) => m.startApp())
    .catch((err) => {
      console.error('[entry-shell] App startup failed:', err)
      // Pre-CSS fallback: mirror the console boot gate inline (the app
      // stylesheet is not available when the app module itself fails).
      const fallback = document.createElement('div')
      fallback.style.cssText =
        'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
        'background:#0b0e14;z-index:9999;'
      fallback.innerHTML =
        '<div style="max-width:22rem;padding:1.4rem 1.5rem 1.5rem;border:1px solid rgba(230,237,243,0.16);' +
        "color:rgba(230,237,243,0.62);font-family:'JetBrains Mono',monospace;text-align:left;'>" +
        '<p style="display:flex;align-items:center;gap:0.6rem;margin:0 0 0.55rem;color:#ff7b72;' +
        'font-size:0.62rem;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;">' +
        '<span style="width:0.3rem;height:0.3rem;background:#ff7b72;"></span>Signal lost</p>' +
        '<p style="margin:0 0 0.55rem;font-size:0.72rem;line-height:1.5;">' +
        'The application failed to boot.</p>' +
        '<span style="color:rgba(230,237,243,0.38);font-size:0.6rem;letter-spacing:0.1em;">' +
        'ERR:BOOT — APP MODULE NOT REACHABLE</span><br/>' +
        '<button onclick="location.reload()" style="margin-top:0.9rem;padding:0.55rem 1.1rem;' +
        'background:none;border:1px solid rgba(230,237,243,0.16);color:#e6edf3;cursor:pointer;' +
        'font-family:inherit;font-size:0.62rem;font-weight:600;letter-spacing:0.14em;' +
        'text-transform:uppercase;">Reload</button></div>'
      document.body.appendChild(fallback)
    })

// Start app: use requestIdleCallback if available (with short timeout),
// otherwise fall back to double-rAF for paint stabilization.
if ('requestIdleCallback' in window) {
  ;(
    window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void }
  ).requestIdleCallback(
    () => {
      requestAnimationFrame(() => requestAnimationFrame(startApp))
    },
    { timeout: 250 },
  )
} else {
  requestAnimationFrame(() => requestAnimationFrame(startApp))
}
