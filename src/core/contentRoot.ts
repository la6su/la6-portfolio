// src/core/contentRoot.ts — the shared DOM root for boot-shell + runtime.
//
// Both the boot shell (entry-app.ts) and the WebGL runtime (Experience.ts)
// query route content against the same root: the SPA mount node when it
// exists, the document otherwise (prerendered splash / early boot). The
// lookup used to be defined twice — one copy drifted per file.

export function contentRoot(): ParentNode {
  return document.getElementById('spa-content') ?? document
}
