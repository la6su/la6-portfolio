/** Shared public origin for generated metadata and sitemap output. */
const DEFAULT_SITE_ORIGIN = 'https://justlovejazz.dev'

export function normalizeSiteOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '')
}

export const SITE_ORIGIN = normalizeSiteOrigin(
  process.env.JLZ_SITE_ORIGIN ?? DEFAULT_SITE_ORIGIN,
)
