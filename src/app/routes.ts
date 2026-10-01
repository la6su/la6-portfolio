// Route records and lazy page components derived from the canonical manifest.

import type { RouteRecordRaw, RouteRecordSingleView } from 'vue-router'

import { ROUTE_MANIFEST, resolvePagePath } from '../core/routeManifest'
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

/**
 * The application's route records: one per manifest entry plus a catch-all
 * that renders `home` under an unknown stale URL (direct-entry fallback).
 * The catch-all is unreachable from in-app navigation: both entry points
 * (`RouterLink`, `jlz:navigate`) resolve through Vue Router.
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
    component: PAGE_VIEWS[resolvePagePath('')],
  })
  return records
}
