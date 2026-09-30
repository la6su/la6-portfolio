<script setup lang="ts">
// src/app/views/ManifestoView.vue — Phase 5: /manifesto route SFC. 1:1
// port of the former string page
// four principles + the two shared
// overlays (section 0 contact finale, section 5 menu).
import { ref } from 'vue'

import { useJlzPage } from '../useJlzPage'
import ContactFooter from './ContactFooter.vue'
import NavMenu from './NavMenu.vue'

const rootEl = ref<HTMLElement | null>(null)
useJlzPage('manifesto', () => rootEl.value)

interface Principle {
  num: string
  title: string
  lead: string
  desc: string[]
  href: string
  key: string
  protocol: string
  evidence: string
  routeLabel: string
}

const PRINCIPLES: readonly Principle[] = [
  {
    num: '01',
    title: 'Purpose',
    lead: "We don't build what everyone builds.",
    desc: ['We solve different problems.', 'We improve experience and understand the pain.'],
    href: '/blog/tsl-changes-everything',
    key: 'manifesto.purpose',
    protocol: 'Start with the tension, not the format.',
    evidence: 'A brief becomes a point of view before it becomes a component.',
    routeLabel: 'See the work',
  },
  {
    num: '02',
    title: 'Clarity',
    lead: 'Clean structure.',
    desc: ['Clear logic.', 'No noise.'],
    href: '/blog/on-demand-rendering',
    key: 'manifesto.clarity',
    protocol: 'Every effect must explain a state.',
    evidence: 'Semantic DOM, one scene owner, one measurable reason to animate.',
    routeLabel: 'Read the method',
  },
  {
    num: '03',
    title: 'Emotion',
    lead: 'We use motion, light, and sound to evoke a sense of presence.',
    desc: [],
    href: '/blog/undercurrent-webgpu-fluid',
    key: 'manifesto.emotion',
    protocol: 'Presence is authored through rhythm.',
    evidence: 'Light, sound and motion settle into a state the visitor can read.',
    routeLabel: 'Enter Services',
  },
  {
    num: '04',
    title: 'Simplicity',
    lead: 'We strive for minimalism — but not emptiness.',
    desc: [],
    href: '/blog/glassmorphism-webgpu',
    key: 'manifesto.simplicity',
    protocol: 'Remove until the signal gets stronger.',
    evidence: 'The interface leaves room for the project and keeps the next action clear.',
    routeLabel: 'Start a project',
  },
]
</script>

<template>
  <main
    id="spa-content"
    ref="rootEl"
    role="main"
    class="uk-position-relative"
    data-page-view="content"
    uk-height-viewport
  >
    <article class="jlz-page" data-page-view="manifesto">
      <!-- 0: CONTACT FINALE (canonical Lab runtime slot) -->
      <ContactFooter mode="content" />

      <!-- 1-4: Purpose / Clarity / Emotion / Simplicity (1 = start, active) -->
      <section
        v-for="(p, i) in PRINCIPLES"
        :key="p.key"
        :class="[
          'jlz-page-section',
          'uk-section',
          'uk-section-small',
          'uk-section-large@m',
          i === 0 ? 'section-active' : '',
        ]"
        :id="`section-${p.key.replace('manifesto.', 'manifesto-')}`"
        :data-page-section="`${p.key.replace('manifesto.', 'manifesto-')}`"
      >
        <div class="uk-container uk-container-expand uk-height-1-1 jlz-manifesto-room">
          <div class="jlz-manifesto-head">
            <span
              class="jlz-eyebrow uk-display-inline-block"
              data-eyebrow
              :data-eyebrow-text="p.num"
              >{{ p.num }}</span
            >
            <h2
              class="studio-title uk-heading-large uk-margin-small-top uk-margin-remove-bottom"
              :data-i18n="`${p.key}.title`"
            >
              {{ p.title }}
            </h2>
            <p
              class="uk-text-lead uk-margin-small-top jlz-manifesto-lead"
              :data-i18n="`${p.key}.lead`"
            >
              {{ p.lead }}
            </p>
          </div>
          <div class="jlz-manifesto-grid">
            <div class="jlz-manifesto-index" aria-hidden="true">{{ p.num }}<span>/04</span></div>
            <div class="jlz-manifesto-protocol">
              <p class="jlz-manifesto-protocol__label">WORKING PROTOCOL</p>
              <p class="jlz-manifesto-protocol__line">{{ p.protocol }}</p>
              <p class="jlz-manifesto-evidence">{{ p.evidence }}</p>
              <div v-if="p.desc.length" class="jlz-service-desc uk-flex uk-flex-column">
                <p
                  v-for="(line, d) in p.desc"
                  :key="d"
                  class="uk-text-meta uk-margin-remove"
                  :data-i18n="`${p.key}.desc${d + 1}`"
                >
                  {{ line }}
                </p>
              </div>
              <a :href="p.href" class="uk-button uk-button-text jlz-manifesto-link"
                ><span>{{ p.routeLabel }}</span
                ><span aria-hidden="true">↗</span></a
              >
            </div>
          </div>
        </div>
      </section>

      <!-- 5: MENU SHEET -->
      <NavMenu mode="content" />
    </article>
  </main>
</template>
