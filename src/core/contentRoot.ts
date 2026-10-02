// Shared root for route content lookups before and after Vue mounts.

export function contentRoot(): ParentNode {
  return document.getElementById('spa-content') ?? document
}
