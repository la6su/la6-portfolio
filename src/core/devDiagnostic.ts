type DiagnosticLevel = 'debug' | 'info' | 'log'

/** Emit development-only runtime details without repeating build-mode guards. */
export function devDiagnostic(level: DiagnosticLevel, ...details: unknown[]): void {
  if (!import.meta.env.DEV) return
  // eslint-disable-next-line no-console -- keep console access behind one DEV-gated boundary
  console[level](...details)
}
