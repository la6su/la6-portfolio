/** Shared public origin for generated metadata and sitemap output. */
const DEFAULT_SITE_ORIGIN = 'https://justlovejazz.dev'

export function normalizeSiteOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '')
}

const injectedOrigin =
  typeof import.meta.env === 'undefined' ? undefined : import.meta.env.VITE_SITE_ORIGIN
const nodeOrigin = typeof process === 'undefined' ? undefined : process.env.JLZ_SITE_ORIGIN

export const SITE_ORIGIN = normalizeSiteOrigin(
  injectedOrigin || nodeOrigin || DEFAULT_SITE_ORIGIN,
)
