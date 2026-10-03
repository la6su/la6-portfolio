<script setup lang="ts">
// Owns the fullscreen overlay CONTENT: text bindings, tag list, nav-arrow
// visibility, poster decode, and the authored title reveal. The UIkit modal
// lifecycle, keyboard handling, and focus trap stay with the
// `FullscreenOverlay` behavior controller that ExperienceUI creates over this
// same element. Content arrives through the typed `jlz:project-content` port.
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import UIkit from '../core/uikit'
import { eventBus } from '../core/EventBus'
import { prefersReducedMotion } from '../core/motionPolicy'
import { BlurFade } from '../UI/BlurFade'

const container = ref<HTMLDivElement | null>(null)
const titleEl = ref<HTMLElement | null>(null)

const category = ref('')
const description = ref('')
const counter = ref('')
const tags = ref<string[]>([])
const hasPrev = ref(false)
const hasNext = ref(false)
const title = ref('')

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
      title.value = content.title ?? ''
      category.value = content.category ?? ''
      description.value = content.description ?? ''
      counter.value = content.counter ?? ''
      tags.value = (content.tags ?? []).filter(Boolean)
      hasPrev.value = content.hasPrev
      hasNext.value = content.hasNext
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
    uk-modal="bg-close: true; esc-close: true; stack: false"
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
        <span uk-icon="icon: close; ratio: 1.25" aria-hidden="true"></span>
      </button>
      <header class="jlz-fs-meta uk-flex uk-flex-between uk-flex-bottom">
        <div>
          <div class="jlz-fs-cat uk-text-meta uk-text-uppercase">{{ category }}</div>
          <h2 ref="titleEl" class="jlz-fs-title uk-heading-small uk-margin-remove"></h2>
          <p
            class="jlz-fs-desc uk-visible@s uk-text-truncate uk-margin-small-top uk-margin-remove-bottom"
          >
            {{ description }}
          </p>
        </div>
        <div class="jlz-fs-meta-end uk-visible@s uk-text-right">
          <div class="jlz-fs-counter uk-text-meta">{{ counter }}</div>
          <div class="jlz-fs-tags uk-flex uk-flex-wrap uk-flex-right uk-margin-small-top">
            <span
              v-for="tag in tags"
              :key="tag"
              class="jlz-fs-tag uk-text-meta uk-text-uppercase"
              >{{ tag }}</span
            >
          </div>
        </div>
      </header>
      <main class="jlz-fs-media-stage uk-position-relative">
        <div
          class="jlz-fs-poster uk-position-cover"
          aria-hidden="true"
          :style="{
            backgroundImage: posterReady && posterUrl ? `url('${posterUrl}')` : '',
            opacity: posterReady ? '1' : '0',
          }"
        ></div>
      </main>
      <button
        v-show="hasPrev"
        class="jlz-nav-arrow jlz-fs-prev uk-flex uk-flex-middle uk-flex-center"
        type="button"
        aria-label="Previous"
        data-i18n-aria-label="common.previous"
      >
        <span uk-icon="icon: slidenav-previous-large" aria-hidden="true"></span>
      </button>
      <button
        v-show="hasNext"
        class="jlz-nav-arrow jlz-fs-next uk-flex uk-flex-middle uk-flex-center"
        type="button"
        aria-label="Next"
        data-i18n-aria-label="common.next"
      >
        <span uk-icon="icon: slidenav-next-large" aria-hidden="true"></span>
      </button>
    </div>
  </div>
</template>
