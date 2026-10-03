// Owns the DOM lifecycle shared by the semantic route components:
//
// - keep the active semantic section in Vue state;
// - apply translations and page metadata;
// - announce route changes;
// - bind menu behavior to the mounted page;
// - initialize UIkit within the page root.
//
// Navigation updates semantic DOM and signals the persistent 3D runtime via
// `jlz:route-change`; it does not recreate the scene.

import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import UIkit from '../core/uikit'

import { eventBus } from '../core/EventBus'
import { applyTranslations } from '../core/i18n'
import { applyMetaTags } from '../core/pageMeta'
import type { PageId } from '../core/routeManifest'
import { initMenuLifecycle } from './menuLifecycle'
import { noSceneRequested } from '../core/sceneMode'
import { observeStoryScroll, resolveStoryTrack, storyPositionFromScroll } from '../core/storyTrack'
import { worldSlotIndex } from '../core/worldSlots'

const FIRST_MAIN = worldSlotIndex('intro')!

export function useJlzPage(
  page: PageId,
  rootEl: () => HTMLElement | null,
  initialSectionId: string,
) {
  const activeSectionId = ref(initialSectionId)
  const sectionUnsubs: Array<() => void> = []
  watch(
    activeSectionId,
    (sectionId) => {
      const root = rootEl()
      const active = root?.querySelector<HTMLElement>(
        `[data-section="${sectionId}"], [data-page-section="${sectionId}"]`,
      )
      if (active) UIkit.update(active)
    },
    { flush: 'post' },
  )
  let idleHandle: number | null = null
  let announcerRafHandle: number | null = null
  let mounted = false
  let disposeMenuLifecycle: (() => void) | null = null
  let noSceneScrollObserver: { dispose: () => void; sync: () => void } | null = null

  onBeforeUnmount(() => {
    mounted = false
    sectionUnsubs.splice(0).forEach((unsubscribe) => unsubscribe())
    disposeMenuLifecycle?.()
    disposeMenuLifecycle = null
    noSceneScrollObserver?.dispose()
    noSceneScrollObserver = null
    if (announcerRafHandle !== null) {
      cancelAnimationFrame(announcerRafHandle)
      announcerRafHandle = null
    }
    if (idleHandle !== null && 'cancelIdleCallback' in window) {
      cancelIdleCallback(idleHandle)
      idleHandle = null
    }
  })

  // Apply page-level behavior after the route DOM is mounted.
  function postRender(): void {
    const el = rootEl()
    if (!el) return
    noSceneScrollObserver?.dispose()
    noSceneScrollObserver = null
    applyTranslations()
    applyMetaTags(page)
    // The app owner publishes this only after its initial route has mounted.
    // Reading that lifecycle state avoids a second module-global flag that
    // survives app teardown and mislabels the first route after remount.
    if (window.__jlzRouterReady) {
      const announcer = document.getElementById('jlz-route-announcer')
      if (announcer) {
        announcer.textContent = ''
        if (announcerRafHandle !== null) cancelAnimationFrame(announcerRafHandle)
        announcerRafHandle = requestAnimationFrame(() => {
          announcerRafHandle = null
          if (mounted) announcer.textContent = document.title
        })
      }
    }
    disposeMenuLifecycle?.()
    disposeMenuLifecycle = initMenuLifecycle(el)
    UIkit.update(el)
    // Typed EventBus emission — app-lifetime listeners subscribe to this port.
    eventBus.emit('jlz:route-change')
    if (noSceneRequested) {
      // Shared track discovery + scroll mapping (core/storyTrack): the same
      // contract CinematicNav uses in scene mode, publishing the active
      // section for the no-scene DOM-only experience.
      const track = resolveStoryTrack(el, page)
      if (track) {
        let lastSectionId = ''
        noSceneScrollObserver = observeStoryScroll(track.scroller, () => {
          if (track.mainSections.length === 0) return
          const { index } = storyPositionFromScroll(track)
          const sectionId = track.mainSections[index]?.dataset[track.sectionKey]
          if (!sectionId || sectionId === lastSectionId) return
          lastSectionId = sectionId
          const worldIndex = FIRST_MAIN + index
          if (page !== 'home') {
            eventBus.emit('jlz:page-section-change', { worldIndex, sectionId })
          } else {
            eventBus.emit('jlz:section-change', { index: worldIndex, sectionId })
          }
        })
        noSceneScrollObserver.sync()
      }
    }
    if ('requestIdleCallback' in window) {
      idleHandle = requestIdleCallback(
        () => {
          idleHandle = null
          if (mounted && rootEl() === el) UIkit.update(el)
        },
        { timeout: 100 },
      )
    }
  }

  onMounted(() => {
    mounted = true
    // These subscribe to a module singleton shared by every SSR route render.
    // Register on the client only: onBeforeUnmount does not run during SSR.
    sectionUnsubs.push(
      eventBus.on('jlz:section-change', ({ sectionId }) => {
        if (page === 'home') activeSectionId.value = sectionId
      }),
      eventBus.on('jlz:page-section-change', ({ sectionId }) => {
        if (page !== 'home') activeSectionId.value = sectionId
      }),
    )
    postRender()
  })

  return activeSectionId
}
