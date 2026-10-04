<script setup lang="ts">
// Owns the fullscreen case theater: project copy, tags, route CTA, poster
// decode, and the authored title reveal. The UIkit modal
// lifecycle, keyboard handling, and focus trap stay with the
// `FullscreenOverlay` behavior controller that ExperienceUI creates over this
// same element. Content arrives through the typed `jlz:project-content` port.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import UIkit from '../core/uikit'
import { eventBus } from '../core/EventBus'
import { langFromPath, localizedPath } from '../core/routeManifest'
import { prefersReducedMotion } from '../core/motionPolicy'
import { BlurFade } from '../UI/BlurFade'

const container = ref<HTMLDivElement | null>(null)
const titleEl = ref<HTMLElement | null>(null)
const route = useRoute()

const projectId = ref('')
const category = ref('')
const description = ref('')
const tags = ref<string[]>([])
const title = ref('')
const caseHref = computed(() =>
  projectId.value ? localizedPath(langFromPath(route.path), `/works/${projectId.value}`) : null,
)

const posterUrl = ref<string | null>(null)
const posterReady = ref(false)
let posterRequestId = 0

const unsubs: Array<() => void> = []

onMounted(() => {
  if (container.value) {
    UIkit.update(container.value)
  }
  unsubs.push(
    eventBus.on('jlz:project-content', (content) => {
      projectId.value = content.projectId
      title.value = content.title ?? ''
      category.value = content.category ?? ''
      description.value = content.description ?? ''
      tags.value = (content.tags ?? []).filter(Boolean)
      posterUrl.value = content.poster ?? null
    }),
  )
})

onBeforeUnmount(() => {
  unsubs.splice(0).forEach((unsubscribe) => unsubscribe())
  // The title reveal is an independent RAF owner. Cancel it synchronously so
  // the static BlurFade registry cannot retain this DOM after unmount.
  if (titleEl.value) BlurFade.for(titleEl.value).hide()
  eventBus.emit('jlz:fullscreen-overlay-unmounted')
})

// Decode the poster image before exposing it: the modal stays transparent
// until decode succeeds, so no transient black frame replaces the scene.
// A newer poster supersedes an in-flight decode (request-id guard).
watch(posterUrl, (poster) => {
  const requestId = ++posterRequestId
  posterReady.value = false
  if (!poster) return
  const image = new Image()
  image.decoding = 'async'
  image.addEventListener(
    'load',
    () => {
      void image
        .decode()
        .catch(() => undefined)
        .then(() => {
          if (requestId !== posterRequestId) return
          posterReady.value = true
        })
    },
    { once: true },
  )
  image.src = poster
})

// Authored per-character title reveal. The element is managed here (not via
// text interpolation) because the reveal replaces its children with animated
// spans; reduced motion keeps the plain text with an explicit aria-label.
watch(title, (value) => {
  const el = titleEl.value
  if (!el) return
  if (!value) {
    el.textContent = ''
    return
  }
  if (prefersReducedMotion()) {
    el.textContent = value
    el.setAttribute('aria-label', value)
  } else {
    BlurFade.for(el).show(0.8, value)
  }
})
</script>

<template>
  <div
    id="jlz-fs-overlay"
    ref="container"
    uk-modal="bg-close: false; esc-close: true; stack: false"
    data-no-magnetic
    class="jlz-fs-overlay uk-modal uk-modal-full uk-light"
    role="dialog"
    aria-modal="true"
    aria-label="Fullscreen project viewer"
    data-i18n-aria-label="common.fullscreenViewer"
  >
    <div class="uk-modal-dialog jlz-fs-dialog">
      <button
        class="uk-modal-close-full uk-close-large jlz-fs-close"
        type="button"
        aria-label="Close"
        data-i18n-aria-label="common.close"
      >
        <span class="jlz-fs-close__label" data-i18n="common.close">Close</span>
        <span uk-icon="icon: close; ratio: 1.15" aria-hidden="true"></span>
      </button>
      <main class="jlz-fs-theater uk-position-relative">
        <div
          class="jlz-fs-poster"
          aria-hidden="true"
          :style="{
            backgroundImage: posterReady && posterUrl ? `url('${posterUrl}')` : '',
            opacity: posterReady ? '1' : '0',
          }"
        ></div>
        <div class="jlz-fs-shade" aria-hidden="true"></div>
        <div class="jlz-fs-topline" aria-hidden="true">
          <span data-i18n="common.selectedProject">Selected project</span>
          <span>{{ category }}</span>
        </div>
        <section class="jlz-fs-copy" :aria-label="title">
          <p class="jlz-fs-kicker" data-i18n="common.projectPresentation">Project presentation</p>
          <h1 ref="titleEl" class="jlz-fs-title"></h1>
          <p class="jlz-fs-desc">{{ description }}</p>
          <div v-if="tags.length" class="jlz-fs-tags" aria-label="Project disciplines">
            <span v-for="tag in tags" :key="tag" class="jlz-fs-tag">{{ tag }}</span>
          </div>
          <RouterLink v-if="caseHref" class="jlz-fs-case-link" :to="caseHref">
            <span data-i18n="common.exploreCase">Explore case study</span>
            <span aria-hidden="true">↗</span>
          </RouterLink>
        </section>
        <div class="jlz-fs-frame" aria-hidden="true"></div>
      </main>
    </div>
  </div>
</template>
