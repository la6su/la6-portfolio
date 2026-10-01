<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import UIkit from 'uikit'
import { NAV_ITEMS } from './navItems'
import { getLang, t, toggleLang } from '../core/i18n'
import { getSoundMuted, setSoundMutedPreference } from '../core/SfxSystem'
import { eventBus } from '../core/EventBus'
import { themeManager } from '../core/ThemeManager'
import { worldSlotIndex } from '../core/worldSlots'
import {
  rendererAvailable,
  setRendererAvailable,
} from '../core/rendererAvailability'
import { noSceneRequested } from '../core/sceneMode'

const language = ref(getLang())
const soundMuted = ref(getSoundMuted())
const fullscreenOpen = ref(false)
const activeIndex = ref(0)
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
    ;(UIkit as unknown as { update(element: Element): void }).update(soundIcon.value)
  }
})

onMounted(() => {
  if (nav.value) {
    ;(UIkit as unknown as { update(element: Element): void }).update(nav.value)
  }
  unsubscribers.push(
    eventBus.on('jlz:lang-change', () => {
      language.value = getLang()
    }),
    eventBus.on('jlz:theme-change', () => {
      themeIsInverse.value = themeManager.isInverse
    }),
    eventBus.on('jlz:sound-toggle', ({ muted }) => {
      soundMuted.value = muted
      setSoundMutedPreference(muted)
    }),
    eventBus.on('jlz:fullscreen-change', ({ open }) => {
      fullscreenOpen.value = open
    }),
    eventBus.on('jlz:story-index-change', ({ index }) => {
      activeIndex.value = index
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

function toggleSound(): void {
  eventBus.emit('jlz:sound-toggle', { muted: !soundMuted.value })
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
        :to="{ name: 'home' }"
        aria-label="JUSTLOVEJAZZ — Studio"
        :aria-hidden="fullscreenOpen"
        :inert="fullscreenOpen"
      >
        <img class="jlz-brand-mark" src="/logo.svg" width="30" height="30" alt="" aria-hidden="true" />
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
          aria-label="Switch language"
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
          aria-label="Toggle inverse theme"
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
          aria-label="Toggle sound"
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
          aria-controls="section-lab"
          :aria-expanded="activeIndex === 0"
          :tabindex="activeIndex === 0 || activeIndex === 5 ? -1 : 0"
          @click="requestStoryNavigation(0)"
        >
          <span class="jlz-contact-launcher__channel" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="16" height="16" focusable="false">
              <path d="M2 3h10v8H2ZM5 13v2M9 13v2M5 6h4M5 8.5h2" />
            </svg>
          </span>
          <span data-i18n="story.contact">{{ t('story.contact') }}</span>
          <span class="jlz-contact-launcher__arrow" uk-icon="icon: arrow-up; ratio: 0.8" aria-hidden="true"></span>
        </button>
      </div>
      <nav id="cinematic-nav" class="jlz-storyline" aria-label="Narrative sections" data-sheet="center">
        <div class="jlz-storyline__items uk-flex uk-flex-middle">
          <button
            v-for="index in storylineSections"
            :key="index"
            class="uk-button jlz-storyline__item"
            :class="{ 'is-active': activeIndex === index }"
            type="button"
            :data-story-index="index"
            :aria-label="`Go to section ${index}`"
            :aria-current="activeIndex === index ? 'step' : undefined"
            @click="requestStoryNavigation(index)"
          >
            <span class="jlz-storyline__number uk-text-meta uk-text-uppercase">{{ String(index).padStart(2, '0') }}</span>
            <span class="jlz-storyline__label uk-hidden" data-story-label>Section {{ index }}</span>
          </button>
        </div>
        <span class="jlz-storyline__hint uk-hidden uk-text-meta uk-text-uppercase" data-i18n="story.hint">Scroll · swipe</span>
      </nav>
    </div>
  </div>
  <div v-else class="jlz-route-fallback">
    <a class="jlz-route-fallback__skip" href="#spa-content">Skip to content</a>
    <header class="jlz-route-fallback__header">
      <RouterLink class="jlz-topbar__brand" :to="{ name: 'home' }" aria-label="JUSTLOVEJAZZ — Studio">
        <img class="jlz-brand-mark" src="/logo.svg" width="30" height="30" alt="" aria-hidden="true" />
        <span class="jlz-topbar__wordmark">JUSTLOVEJAZZ</span>
      </RouterLink>
      <button
        class="uk-icon-button jlz-lang-toggle"
        type="button"
        aria-label="Switch language"
        :aria-pressed="language === 'RU'"
        @click="toggleLang"
      >
        <span class="jlz-lang-label uk-text-uppercase uk-text-bold">{{ language }}</span>
      </button>
    </header>
    <nav aria-label="Portfolio routes" class="jlz-route-fallback__nav">
      <template v-for="item in NAV_ITEMS" :key="item.num">
        <RouterLink v-if="item.page" :to="{ name: item.page }">
          <span class="jlz-route-fallback__number">{{ item.num }}</span>
          {{ t(item.labelKey) }}
        </RouterLink>
        <a v-else :href="item.href">
          <span class="jlz-route-fallback__number">{{ item.num }}</span>
          {{ t(item.labelKey) }}
        </a>
      </template>
    </nav>
  </div>
</template>
