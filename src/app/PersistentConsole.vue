<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import UIkit from '../core/uikit'
import { NAV_ITEMS } from './navItems'
import { getLang, t, toggleLang, TRANSLATIONS } from '../core/i18n'
import { getSoundMuted, setSoundMutedPreference } from '../core/SfxSystem'
import { eventBus } from '../core/EventBus'
import { themeManager } from '../core/ThemeManager'
import { worldSlotIndex } from '../core/worldSlots'
import { rendererAvailable, setRendererAvailable } from '../core/rendererAvailability'
import { noSceneRequested } from '../core/sceneMode'
import {
  langFromPath,
  localizedPagePath,
  localizedPath,
  unlocalizedPath,
} from '../core/routeManifest'
import { getWorksCaseProject } from '../core/worksExperience'

const language = ref(getLang())
const route = useRoute()
const pageHref = (page: import('../core/routeManifest').PageId): string =>
  localizedPagePath(page, langFromPath(route.path))
const blogHref = (path: string): string => localizedPath(langFromPath(route.path), path)
const currentPath = computed(() => unlocalizedPath(route.path))
const soundMuted = ref(getSoundMuted())
const fullscreenOpen = ref(false)
const activeIndex = ref(0)
const focusedProjectIndex = ref(0)
const activePageSection = ref('')
watch(currentPath, () => {
  activePageSection.value = ''
})
// Storyline labels published by the CinematicNav behavior controller from the
// track's section headings; this view is the single aria-label writer.
const storyLabels = ref<string[]>([])
const themeIsInverse = ref(themeManager.isInverse)
const soundIcon = ref<HTMLElement | null>(null)
const menuLabel = computed(() => t(fullscreenOpen.value ? 'common.close' : 'menu.navigate'))
const nav = ref<HTMLElement | null>(null)
const firstStorySection = worldSlotIndex('intro')!
const lastStorySection = worldSlotIndex('contact')!
const storylineSections = Array.from(
  { length: lastStorySection - firstStorySection + 1 },
  (_, index) => firstStorySection + index,
)

const unsubscribers: Array<() => void> = []

watch(soundMuted, async () => {
  await nextTick()
  if (soundIcon.value) {
    UIkit.update(soundIcon.value)
  }
})

onMounted(() => {
  if (nav.value) {
    UIkit.update(nav.value)
  }
  activePageSection.value =
    document.querySelector<HTMLElement>('.jlz-page-section.section-active')?.dataset.pageSection ??
    ''
  unsubscribers.push(
    eventBus.on('jlz:lang-change', () => {
      language.value = getLang()
    }),
    eventBus.on('jlz:theme-change', () => {
      themeIsInverse.value = themeManager.isInverse
    }),
    eventBus.on('jlz:sound-toggle', ({ muted }) => {
      soundMuted.value = muted
    }),
    eventBus.on('jlz:fullscreen-change', ({ open }) => {
      fullscreenOpen.value = open
    }),
    eventBus.on('jlz:story-index-change', ({ index }) => {
      activeIndex.value = index
    }),
    eventBus.on('jlz:carousel-focus', ({ index }) => {
      focusedProjectIndex.value = index
    }),
    eventBus.on('jlz:page-section-change', ({ sectionId }) => {
      activePageSection.value = sectionId
    }),
    eventBus.on('jlz:story-labels', ({ labels }) => {
      storyLabels.value = labels
    }),
    eventBus.on('jlz:webgl-ready', () => {
      setRendererAvailable(!noSceneRequested)
    }),
    eventBus.on('jlz:webgl-failed', () => {
      setRendererAvailable(false)
    }),
  )
})

onBeforeUnmount(() => {
  unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe())
})

function requestStoryNavigation(index: number): void {
  if (fullscreenOpen.value && index === 5) {
    eventBus.emit('jlz:close-media-layer')
    return
  }
  eventBus.emit('jlz:story-navigate', { index })
}

const SECTION_EXPLORE_PATHS: Record<string, string> = {
  'services-creativeDirection': '/blog/glassmorphism-webgpu',
  'services-interactiveDev': '/blog/on-demand-rendering',
  'services-motionRealtime': '/blog/tsl-changes-everything',
  'manifesto-friction': '/services',
  'manifesto-clarity': '/blog/on-demand-rendering',
  'manifesto-motion': '/blog/undercurrent-webgpu-fluid',
  'manifesto-complexity': '/blog/tsl-changes-everything',
  'lab-01': '/blog/glassmorphism-webgpu',
  'lab-02': '/blog/tsl-changes-everything',
  'lab-03': '/blog/undercurrent-webgpu-fluid',
  'lab-04': '/blog/on-demand-rendering',
}

const launcherLabel = computed(() => {
  let key = 'launcher.contact'
  if (currentPath.value === '/') {
    if (activeIndex.value === 1) key = 'launcher.reel'
    else if (activeIndex.value === 2 || activeIndex.value === 3) key = 'launcher.explore'
  } else if (
    SECTION_EXPLORE_PATHS[activePageSection.value] ||
    activePageSection.value.startsWith('works-') ||
    /^case-[1-3]$/.test(activePageSection.value)
  ) {
    key = 'launcher.explore'
  }
  return TRANSLATIONS[language.value][key] ?? t(key)
})

function activateContextAction(): void {
  if (currentPath.value === '/') {
    switch (activeIndex.value) {
      case 1:
        eventBus.emit('jlz:showreel-open')
        return
      case 2:
        eventBus.emit('jlz:navigate', { path: pageHref('services') })
        return
      case 3:
        eventBus.emit('jlz:open-project', { idx: focusedProjectIndex.value })
        return
    }
  }

  const explorePath = SECTION_EXPLORE_PATHS[activePageSection.value]
  if (explorePath) {
    window.location.assign(blogHref(explorePath))
    return
  }

  const worksSection = /^works-(\d+)$/.exec(activePageSection.value)
  if (worksSection) {
    eventBus.emit('jlz:open-project', { idx: Number(worksSection[1]) - 1 })
    return
  }

  if (/^case-[1-3]$/.test(activePageSection.value)) {
    eventBus.emit('jlz:open-project', { idx: getWorksCaseProject() ?? 0 })
    return
  }

  requestStoryNavigation(0)
}

/** The storyline button label: the track heading when published, else the slot. */
function storyLabel(index: number): string {
  return storyLabels.value[index - firstStorySection] ?? String(index)
}

function toggleSound(): void {
  const muted = !soundMuted.value
  setSoundMutedPreference(muted)
  eventBus.emit('jlz:sound-toggle', { muted })
}
</script>

<template>
  <div
    v-if="rendererAvailable"
    ref="nav"
    class="jlz-cinematic-shell uk-position-relative"
    :class="{
      'is-fullscreen-open': fullscreenOpen,
      'is-menu-open': activeIndex === 5,
      'is-contact-open': activeIndex === 0,
    }"
  >
    <header class="jlz-topbar uk-flex uk-flex-middle uk-flex-between">
      <RouterLink
        class="jlz-topbar__brand uk-flex uk-flex-inline uk-flex-middle uk-text-uppercase uk-text-decoration-none"
        :to="pageHref('home')"
        :aria-label="t('nav.brand')"
        :aria-hidden="fullscreenOpen"
        :inert="fullscreenOpen"
      >
        <img
          class="jlz-brand-mark"
          src="/logo.svg"
          width="30"
          height="30"
          alt=""
          aria-hidden="true"
        />
        <span class="jlz-topbar__wordmark">JUSTLOVEJAZZ</span>
        <span class="jlz-topbar__mode" aria-hidden="true">
          WORLD / {{ String(activeIndex + 1).padStart(2, '0') }}
        </span>
      </RouterLink>
      <div class="jlz-topbar-controls uk-flex uk-flex-middle">
        <button
          class="uk-icon-button jlz-lang-toggle"
          type="button"
          id="jlz-lang-toggle"
          :aria-label="t('common.switchLanguage')"
          :aria-pressed="language === 'RU'"
          :aria-hidden="fullscreenOpen"
          :inert="fullscreenOpen"
          title="Language"
          uk-tooltip="pos: bottom; delay: 200"
          @click="toggleLang"
        >
          <span class="jlz-lang-label uk-text-uppercase uk-text-bold">{{ language }}</span>
        </button>
        <button
          class="uk-icon-button jlz-theme-toggle"
          :class="{ 'is-inverse': themeIsInverse }"
          type="button"
          id="jlz-theme-toggle"
          :aria-label="t('common.toggleInverseTheme')"
          :aria-pressed="themeIsInverse"
          :aria-hidden="fullscreenOpen"
          :inert="fullscreenOpen"
          :title="themeIsInverse ? 'Theme: inverse' : 'Theme: auto'"
          uk-tooltip="pos: bottom; delay: 200"
          @click="themeManager.toggle()"
        >
          <span uk-icon="icon: theme-auto" aria-hidden="true"></span>
          <span uk-icon="icon: theme-inverse" aria-hidden="true"></span>
        </button>
        <button
          class="uk-icon-button jlz-sound-toggle"
          :class="{ 'is-muted': soundMuted }"
          type="button"
          id="jlz-sound-toggle"
          :aria-label="t('common.toggleSound')"
          :aria-pressed="!soundMuted"
          :aria-hidden="fullscreenOpen"
          :inert="fullscreenOpen"
          :title="soundMuted ? 'Sound: off' : 'Sound: on'"
          uk-tooltip="pos: bottom; delay: 200"
          @click="toggleSound"
        >
          <span
            ref="soundIcon"
            :uk-icon="`icon: ${soundMuted ? 'muted' : 'sound'}`"
            aria-hidden="true"
          ></span>
        </button>
        <button
          class="uk-button uk-button-default uk-flex uk-flex-middle jlz-menu-launcher"
          type="button"
          id="jlz-menu-launcher"
          aria-controls="section-menu"
          :aria-expanded="activeIndex === 5"
          :aria-label="menuLabel"
          @click="requestStoryNavigation(5)"
        >
          <span class="jlz-menu-launcher__label" data-i18n="menu.navigate">{{ menuLabel }}</span>
          <span class="jlz-menu-launcher__glyph" aria-hidden="true"><i></i><i></i></span>
        </button>
      </div>
    </header>
    <div class="jlz-console-bar" :aria-hidden="fullscreenOpen" :inert="fullscreenOpen">
      <span class="jlz-console-bar__signal" aria-hidden="true"></span>
      <div class="jlz-contact-launcher">
        <button
          class="uk-button uk-button-default uk-flex uk-flex-middle jlz-contact-launcher__button"
          type="button"
          id="jlz-contact-launcher"
          :aria-label="launcherLabel"
          :tabindex="activeIndex === 0 || activeIndex === 5 ? -1 : 0"
          @click="activateContextAction"
        >
          <span class="jlz-contact-launcher__channel" aria-hidden="true">
            <svg viewBox="0 0 16 16" focusable="false">
              <path d="M2 3h10v8H2ZM5 13v2M9 13v2M5 6h4M5 8.5h2" />
            </svg>
          </span>
          <span>{{ launcherLabel }}</span>
        </button>
      </div>
      <nav
        id="cinematic-nav"
        class="jlz-storyline"
        :aria-label="t('nav.storyline')"
        :inert="activeIndex === 0 || activeIndex === 5"
      >
        <div class="jlz-storyline__items uk-flex uk-flex-middle">
          <button
            v-for="index in storylineSections"
            :key="index"
            class="uk-button jlz-storyline__item"
            :class="{ 'is-active': activeIndex === index }"
            type="button"
            :data-story-index="index"
            :aria-label="`${t('nav.goToSection')} ${storyLabel(index)}`"
            :aria-current="activeIndex === index ? 'step' : undefined"
            @click="requestStoryNavigation(index)"
          >
            <span class="jlz-storyline__number uk-text-meta uk-text-uppercase">{{
              String(index).padStart(2, '0')
            }}</span>
          </button>
        </div>
        <span
          class="jlz-storyline__hint uk-hidden uk-text-meta uk-text-uppercase"
          data-i18n="story.hint"
          >Scroll · swipe</span
        >
      </nav>
    </div>
  </div>
  <div v-else class="jlz-route-fallback">
    <a class="jlz-route-fallback__skip" href="#spa-content" data-i18n="common.skipToContent"
      >Skip to content</a
    >
    <header class="jlz-route-fallback__header">
      <RouterLink class="jlz-topbar__brand" :to="pageHref('home')" :aria-label="t('nav.brand')">
        <img
          class="jlz-brand-mark"
          src="/logo.svg"
          width="30"
          height="30"
          alt=""
          aria-hidden="true"
        />
        <span class="jlz-topbar__wordmark">JUSTLOVEJAZZ</span>
      </RouterLink>
      <button
        class="uk-icon-button jlz-lang-toggle"
        type="button"
        :aria-label="t('common.switchLanguage')"
        :aria-pressed="language === 'RU'"
        @click="toggleLang"
      >
        <span class="jlz-lang-label uk-text-uppercase uk-text-bold">{{ language }}</span>
      </button>
    </header>
    <nav :aria-label="t('nav.routes')" class="jlz-route-fallback__nav">
      <template v-for="item in NAV_ITEMS" :key="item.num">
        <RouterLink v-if="item.page" :to="pageHref(item.page)">
          <span class="jlz-route-fallback__number">{{ item.num }}</span>
          {{ t(item.labelKey) }}
        </RouterLink>
        <a v-else :href="blogHref(item.href)">
          <span class="jlz-route-fallback__number">{{ item.num }}</span>
          {{ t(item.labelKey) }}
        </a>
      </template>
    </nav>
  </div>
</template>
