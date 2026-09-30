// src/app/routes.ts — Phase 5: Vue Router records built from the Phase 3
// route manifest.
//
// The manifest (`src/core/routeManifest.ts`) remains the single source of
// truth for public paths: the records below are derived from it, never
// re-declared. The component per record is the semantic route SFC
// (`src/app/views/*`). `pageForPath` is the lenient location resolution the
// initial-load contract needs (unknown direct entry → home, URL untouched);
// in-app navigation stays strict — the click handler and `jlz:navigate`
// resolve against the manifest before pushing, so an unknown link is a
// no-op exactly as with the legacy router.

import type { RouteRecordRaw, RouteRecordSingleView } from 'vue-router'

import { ROUTE_MANIFEST, isCaseStudyPath, resolvePage } from '../core/routeManifest'
import type { PageId } from '../core/routeManifest'
import HomeView from './views/HomeView.vue'
import CaseStudyView from './views/CaseStudyView.vue'

// Keep the landing view in the initial app graph so the first shell can render
// without a second route fetch. Secondary pages are explicit route-level
// chunks: this keeps their semantic DOM and page-only code out of the startup
// bundle without introducing a variable import context.
const PAGE_VIEWS: Record<PageId, RouteRecordSingleView['component']> = {
  home: HomeView,
  services: () => import('./views/ServicesView.vue'),
  works: () => import('./views/WorksView.vue'),
  manifesto: () => import('./views/ManifestoView.vue'),
  lab: () => import('./views/LabView.vue'),
  contact: () => import('./views/ContactView.vue'),
}

/** Lenient page resolution for a router location (initial-load contract). */
export function pageForPath(path: string): PageId {
  return isCaseStudyPath(path) ? 'works' : resolvePage(path)
}

/**
 * The application's route records: one per manifest entry plus a catch-all
 * that renders `home` under an unknown stale URL (direct-entry fallback).
 * The catch-all is unreachable from in-app navigation: both entry points
 * (anchor clicks, `jlz:navigate`) strict-resolve before pushing.
 */
export function jlzRouteRecords(): RouteRecordRaw[] {
  const records: RouteRecordRaw[] = ROUTE_MANIFEST.map((entry) => ({
    path: entry.path,
    name: entry.page,
    component: PAGE_VIEWS[entry.page],
  }))
  records.push({ path: '/works/:projectId', name: 'case-study', component: CaseStudyView })
  records.push({
    path: '/:pathMatch(.*)*',
    name: 'fallback',
    component: PAGE_VIEWS[pageForPath('')],
  })
  return records
}
