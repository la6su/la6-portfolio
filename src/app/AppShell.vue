<script setup lang="ts">
// src/app/AppShell.vue — Phase 5 public application shell.
//
// The root SFC mounted on `#app` (after the inline splash shell, which stays
// outside the Vue mount per AGENTS.md). It is intentionally thin for now:
// the static chrome (skip link, route announcer, splash loader) lives in
// `index.html` and moves into this shell as the Phase 5 route and
// navigation SFC slices land. `RouterView` hosts the active page through
// the route records (`src/app/routes.ts`).
//
// Phase 7: `SceneHost` is the persistent Tres root — a SIBLING of RouterView
// so route navigation never remounts the scene root (acceptance: one canvas,
// renderer and loop owner for the application lifetime).
import { RouterView } from 'vue-router'
import SceneHost from './SceneHost.vue'
</script>

<template>
  <SceneHost />
  <RouterView />
</template>
