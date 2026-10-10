<script setup lang="ts">
// Four working principles, expressed as decisions and checks rather than slogans.
import { ref } from 'vue'
import { useRoute } from 'vue-router'

import { langFromPath, localizedPath } from '../../core/routeManifest'
import { useJlzPage } from '../useJlzPage'
import ContactFooter from './ContactFooter.vue'
import NavMenu from './NavMenu.vue'
import { rendererAvailable } from '../../core/rendererAvailability'

const rootEl = ref<HTMLElement | null>(null)
const route = useRoute()
const activeSectionId = useJlzPage('manifesto', () => rootEl.value, 'manifesto-friction')

const PRINCIPLES = [
  { num: '01', key: 'friction', href: '/services' },
  { num: '02', key: 'clarity', href: '/blog/on-demand-rendering' },
  { num: '03', key: 'motion', href: '/blog/undercurrent-webgpu-fluid' },
  { num: '04', key: 'complexity', href: '/blog/tsl-changes-everything' },
] as const
</script>

<template>
  <main
    id="spa-content"
    tabindex="-1"
    ref="rootEl"
    role="main"
    class="uk-position-relative"
    data-page-view="content"
    uk-height-viewport
  >
    <article class="jlz-page jlz-manifesto-page" data-page-view="manifesto">
      <ContactFooter mode="content" :active-section-id="activeSectionId" />
      <h1 class="uk-hidden-visually" data-i18n="manifesto.pageTitle">
        A point of view, put to work
      </h1>

      <section
        v-for="principle in PRINCIPLES"
        :key="principle.key"
        class="jlz-page-section jlz-manifesto-section uk-section uk-section-small uk-section-large@m"
        :class="{
          'section-active': activeSectionId === `manifesto-${principle.key}`,
        }"
        :id="`section-manifesto-${principle.key}`"
        :data-page-section="`manifesto-${principle.key}`"
        :data-principle="principle.num"
      >
        <div class="uk-container uk-container-expand uk-height-1-1 jlz-manifesto-room">
          <header class="jlz-manifesto-head">
            <div class="jlz-manifesto-overline">
              <span data-i18n="manifesto.sectionLabel">FIELD NOTES / STUDIO PRACTICE</span>
              <span class="jlz-manifesto-count">{{ principle.num }} <i>/ 04</i></span>
            </div>
            <h2
              class="studio-title uk-heading-large uk-margin-remove"
              :data-i18n="`manifesto.${principle.key}.title`"
            >
              Start with friction
            </h2>
            <p
              class="jlz-manifesto-lead uk-margin-small-top"
              :data-i18n="`manifesto.${principle.key}.lead`"
            >
              Find the moment the task becomes harder than it should be.
            </p>
          </header>

          <div class="jlz-manifesto-dossier">
            <span class="jlz-manifesto-dossier__index" aria-hidden="true">{{ principle.num }}</span>
            <div class="jlz-manifesto-rule">
              <span class="jlz-manifesto-rule__label" data-i18n="manifesto.ruleLabel"
                >DECISION RULE</span
              >
              <p :data-i18n="`manifesto.${principle.key}.rule`">
                Improve the point of hesitation before adding another feature.
              </p>
            </div>
            <dl class="jlz-manifesto-checks">
              <div>
                <dt data-i18n="manifesto.practiceLabel">IN PRACTICE</dt>
                <dd :data-i18n="`manifesto.${principle.key}.practice`">
                  Watch one real task, find the pause, then change one thing.
                </dd>
              </div>
              <div>
                <dt data-i18n="manifesto.checkLabel">WE CHECK</dt>
                <dd :data-i18n="`manifesto.${principle.key}.check`">
                  Can someone complete the task without a new explanation?
                </dd>
              </div>
            </dl>
            <a
              v-if="!rendererAvailable"
              :href="localizedPath(langFromPath(route.path), principle.href)"
              class="jlz-manifesto-read uk-link-reset"
              :data-i18n="`manifesto.${principle.key}.link`"
            >
              Explore the practice <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      </section>

      <NavMenu mode="content" :active-section-id="activeSectionId" />
    </article>
  </main>
</template>
