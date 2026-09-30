<script setup lang="ts">
// src/app/views/LabView.vue — Phase 5: /lab route SFC. 1:1 port of the
// former string page: four R&D
// experiments + the two shared overlays.
import { ref } from 'vue'

import { useJlzPage } from '../useJlzPage'
import ContactFooter from './ContactFooter.vue'
import NavMenu from './NavMenu.vue'

const rootEl = ref<HTMLElement | null>(null)
useJlzPage('lab', () => rootEl.value)

interface Experiment {
  num: string
  title: string
  lead: string
  desc: string[]
  noteHref: string
  mode: string
  modeKey: string
  key: string
}

const EXPERIMENTS: readonly Experiment[] = [
  {
    num: '01',
    title: 'Shader Lab',
    lead: 'Materials that carry light.',
    desc: [
      'Transmission, iridescence and fluid fields.',
      'A scene starts with one controllable visual rule.',
    ],
    noteHref: '/blog/glassmorphism-webgpu',
    mode: 'TSL material study',
    modeKey: 'lab.shaderLab.mode',
    key: 'lab.shaderLab',
  },
  {
    num: '02',
    title: 'Audio Reactive',
    lead: 'Sound becomes spatial input.',
    desc: [
      'Frequency data becomes movement, not decoration.',
      'The scene must also make sense in silence.',
    ],
    noteHref: '/blog/tsl-changes-everything',
    mode: 'Web Audio input',
    modeKey: 'lab.audioReactive.mode',
    key: 'lab.audioReactive',
  },
  {
    num: '03',
    title: 'Generative',
    lead: 'A system, not a loop.',
    desc: [
      'Noise, rules and controlled variation.',
      'Every parameter needs a visible consequence.',
    ],
    noteHref: '/blog/undercurrent-webgpu-fluid',
    mode: 'Procedural system',
    modeKey: 'lab.generative.mode',
    key: 'lab.generative',
  },
  {
    num: '04',
    title: 'GPU Particles',
    lead: 'Density without idle cost.',
    desc: [
      'Instancing, GPU state and restraint.',
      'No animation is worth an always-on render loop.',
    ],
    noteHref: '/blog/on-demand-rendering',
    mode: 'Performance study',
    modeKey: 'lab.gpuParticles.mode',
    key: 'lab.gpuParticles',
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
    <article class="jlz-page" data-page-view="lab">
      <!-- 0: CONTACT FINALE (canonical Lab runtime slot) -->
      <ContactFooter mode="content" />

      <!-- 1-4: experiments (1 = start, active) -->
      <section
        v-for="(exp, i) in EXPERIMENTS"
        :key="exp.num"
        :class="[
          'jlz-page-section',
          'uk-section',
          'uk-section-small',
          'uk-section-large@m',
          i === 0 ? 'section-active' : '',
        ]"
        :id="`section-lab-${exp.num}`"
        :data-page-section="`lab-${exp.num}`"
      >
        <div
          class="uk-container uk-container-expand uk-padding uk-flex uk-flex-column uk-flex-between uk-height-1-1"
        >
          <div class="jlz-section-top uk-text-center uk-flex uk-flex-column uk-flex-middle">
            <span
              class="jlz-eyebrow uk-display-inline-block"
              data-eyebrow
              :data-eyebrow-text="exp.num"
              >{{ exp.num }}</span
            >
            <h2
              class="studio-title uk-heading-large uk-margin-small-top uk-margin-remove-bottom"
              :data-i18n="`${exp.key}.title`"
            >
              {{ exp.title }}
            </h2>
            <p class="uk-text-lead uk-margin-small-top" :data-i18n="`${exp.key}.lead`">
              {{ exp.lead }}
            </p>
          </div>
          <div class="jlz-section-bottom">
            <div class="jlz-cinematic-shell">
              <div>
                <span aria-hidden="true">></span>
              </div>
              <div>
                <div class="jlz-service-desc uk-flex uk-flex-column">
                  <p
                    v-for="(line, d) in exp.desc"
                    :key="d"
                    class="uk-text-meta uk-margin-remove"
                    :data-i18n="`${exp.key}.desc${d + 1}`"
                  >
                    {{ line }}
                  </p>
                </div>
                <div
                  class="jlz-experiment-footer uk-flex uk-flex-wrap uk-flex-middle uk-width-1-1 uk-margin-remove-top"
                >
                  <span
                    class="jlz-experiment-footer__mode uk-text-uppercase"
                    :data-i18n="exp.modeKey"
                  >
                    {{ exp.mode }}
                  </span>
                  <span
                    class="jlz-experiment-footer__state uk-text-uppercase uk-text-muted"
                    data-i18n="lab.sceneState"
                  >
                    Isolated scene · in development
                  </span>
                  <a
                    :href="exp.noteHref"
                    class="jlz-service-explore uk-button uk-button-default uk-button-small uk-text-uppercase uk-margin-top uk-flex uk-flex-none uk-flex-inline uk-flex-middle uk-margin-auto-left"
                  >
                    <span
                      class="jlz-service-explore__dot uk-display-inline-block"
                      aria-hidden="true"
                    ></span>
                    <span data-i18n="lab.readNote">Read development note</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 5: MENU SHEET -->
      <NavMenu mode="content" />
    </article>
  </main>
</template>
