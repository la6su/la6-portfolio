/** Shared renderer delivery, excluding route-owned Contact addons. */
export function sharedThreeAsset(names: readonly string[]): string {
  const matches = names.filter((name) =>
    /^vendor-three-(?!contact-(?:loaders|geometry)-)[\w-]+\.js$/.test(name),
  )
  if (matches.length !== 1) {
    throw new Error(`Expected one shared Three.js asset, found ${matches.length}. Build first.`)
  }
  return matches[0]!
}
