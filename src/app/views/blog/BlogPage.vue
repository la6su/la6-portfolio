<script setup lang="ts">
// src/app/views/blog/BlogPage.vue — Phase 9, slice 4: the SSG content
// pipeline's page component. Wraps first-party editorial markup (the
// `content/blog/*.html` sources, loaded through the `?raw` content registry)
// in the shared `BlogLayout` shell. The body is inlined as trusted static
// HTML (`v-html`): these documents are prerender-only (no hydration, no
// client bundle), so the HTML path stays a proven static output per the
// builder/content-delivery boundary. Nothing in this graph imports Tres/Three.
import BlogLayout from './BlogLayout.vue'

defineProps<{
  variant: 'index' | 'article'
  /** The `<main>` inner HTML (first-party editorial source). */
  body: string
}>()
</script>

<template>
  <BlogLayout :variant="variant">
    <main id="main" class="uk-section uk-section-large" role="main" v-html="body"></main>
  </BlogLayout>
</template>
