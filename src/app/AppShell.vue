<script setup lang="ts">
// Keep the scene root mounted across route changes; RouterView owns page content.
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterView } from 'vue-router'
import { BlurFade } from '../UI/BlurFade'
import { NoiseText } from '../UI/NoiseText'
import { eventBus } from '../core/EventBus'
import { contentRoot } from '../core/contentRoot'
import { prefersReducedMotion } from '../core/motionPolicy'
import ExperienceRuntime from './ExperienceRuntime.vue'
import PersistentConsole from './PersistentConsole.vue'
import FullscreenOverlayView from './FullscreenOverlayView.vue'
import ShowreelConsole from './ShowreelConsole.vue'
import RouteTransitionView from './RouteTransitionView.vue'

const runtimeOwner = ref<InstanceType<typeof ExperienceRuntime> | null>(null)
let splashEntered = false
let firstRevealFrame: number | null = null
const revealUnsubs: Array<() => void> = []

function revealSection(section: ParentNode | null): void {
  if (!section || !splashEntered || prefersReducedMotion()) return
  const title = section.querySelector<HTMLElement>('.studio-title')
  if (title) BlurFade.reveal(title, 1.5)
  const eyebrow = section.querySelector<HTMLElement>('[data-eyebrow]')
  if (eyebrow) NoiseText.revealEyebrow(eyebrow)
}

onMounted(() => {
  revealUnsubs.push(
    eventBus.on('jlz:splash-entered', () => {
      splashEntered = true
      if (prefersReducedMotion()) return
      firstRevealFrame = requestAnimationFrame(() => {
        firstRevealFrame = requestAnimationFrame(() => {
          firstRevealFrame = null
          const root = contentRoot()
          const title = root.querySelector<HTMLElement>(
            '.studio-title:not([data-blur-fade="off"])',
          )
          if (title) BlurFade.reveal(title, 0.55, title.textContent?.trim() ?? '')
          const eyebrow = root.querySelector<HTMLElement>('[data-eyebrow]')
          if (eyebrow) NoiseText.revealEyebrow(eyebrow)
        })
      })
    }),
    eventBus.on('jlz:section-change', ({ sectionId }) => {
      if (!sectionId) return
      revealSection(contentRoot().querySelector(`[data-section="${sectionId}"]`))
    }),
    eventBus.on('jlz:page-section-change', ({ sectionId }) => {
      revealSection(contentRoot().querySelector(`[data-page-section="${sectionId}"]`))
    }),
  )
})

onBeforeUnmount(() => {
  revealUnsubs.splice(0).forEach((unsubscribe) => unsubscribe())
  if (firstRevealFrame !== null) cancelAnimationFrame(firstRevealFrame)
})

async function destroyExperience(): Promise<void> {
  await runtimeOwner.value?.destroyRuntime()
}

defineExpose({ destroyExperience })
</script>

<template>
  <ExperienceRuntime ref="runtimeOwner" />
  <PersistentConsole />
  <FullscreenOverlayView />
  <ShowreelConsole />
  <RouteTransitionView />
  <RouterView />
</template>
