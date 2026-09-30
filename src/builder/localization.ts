/** Locales supported by authored builder content. Kept framework-neutral. */
export type BuilderLocale = 'EN' | 'RU'

/** Resolve a Russian override, falling back to canonical English content. */
export function localizedProp(
  props: Record<string, string>,
  key: string,
  locale: BuilderLocale = 'EN',
): string {
  if (locale === 'RU') {
    const russian = props[`${key}Ru`]?.trim()
    if (russian) return russian
  }
  return props[key] ?? ''
}
