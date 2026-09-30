// src/core/routePage.ts — typed in-memory route-page port.
//
// Scene/UI consumers read the typed value directly; Vue route roots own their
// semantic DOM markers and no body/document dataset mirrors route state.
//
// Namespace note: the dataset carries a *PageId* (`'services'`), not a route
// *path* (`'/services'`). The port therefore validates against the manifest's
// page set (`MANIFEST_PAGES`) — the strict path resolvers in
// `routeManifest.ts` operate on a different namespace and must not be used
// here.

import type { PageId } from './routeManifest'
import { MANIFEST_PAGES } from './routeManifest'

const PAGE_IDS: ReadonlySet<string> = new Set<string>(MANIFEST_PAGES)

let currentPage: PageId = 'home'

/** Read typed application route state; never read the DOM. */
export function getCurrentPage(): PageId {
  return currentPage
}

/** Set the typed route page after its Vue route root has mounted. */
export function setCurrentPage(page: PageId): void {
  if (!PAGE_IDS.has(page)) return
  currentPage = page
}
