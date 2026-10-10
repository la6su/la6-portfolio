<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'

import { langFromPath, localizedPath } from '../../core/routeManifest'
import { rendererAvailable } from '../../core/rendererAvailability'
import { useJlzPage } from '../useJlzPage'
import ContactFooter from './ContactFooter.vue'
import NavMenu from './NavMenu.vue'

const rootEl = ref<HTMLElement | null>(null)
const route = useRoute()
const blogHref = (path: string): string => localizedPath(langFromPath(route.path), path)
const activeSectionId = useJlzPage('services', () => rootEl.value, 'services-creativeDirection')

const services = [
  {
    id: 'creativeDirection',
    number: '01',
    title: 'services.creativeDirection.title',
    lead: 'services.creativeDirection.lead',
    result: 'services.creativeDirection.result',
    capabilities: [
      'services.creativeDirection.capability1',
      'services.creativeDirection.capability2',
      'services.creativeDirection.capability3',
    ],
    href: '/blog/glassmorphism-webgpu',
  },
  {
    id: 'interactiveDev',
    number: '02',
    title: 'services.interactiveDev.title',
    lead: 'services.interactiveDev.lead',
    result: 'services.interactiveDev.result',
    capabilities: [
      'services.interactiveDev.capability1',
      'services.interactiveDev.capability2',
      'services.interactiveDev.capability3',
    ],
    href: '/blog/on-demand-rendering',
  },
  {
    id: 'motionRealtime',
    number: '03',
    title: 'services.motionRealtime.title',
    lead: 'services.motionRealtime.lead',
    result: 'services.motionRealtime.result',
    capabilities: [
      'services.motionRealtime.capability1',
      'services.motionRealtime.capability2',
      'services.motionRealtime.capability3',
    ],
    href: '/blog/tsl-changes-everything',
  },
  {
    id: 'aiSystems',
    number: '04',
    title: 'services.aiSystems.title',
    lead: 'services.aiSystems.lead',
    result: 'services.aiSystems.result',
    capabilities: [
      'services.aiSystems.capability1',
      'services.aiSystems.capability2',
      'services.aiSystems.capability3',
    ],
    href: '/blog/on-demand-rendering',
  },
]
</script>

<template>
  <main
    id="spa-content"
    ref="rootEl"
    tabindex="-1"
    role="main"
    class="uk-position-relative"
    data-page-view="content"
    uk-height-viewport
  >
    <article class="jlz-page jlz-services-page" data-page-view="services">
      <ContactFooter mode="content" :active-section-id="activeSectionId" />
      <h1 class="uk-hidden-visually" data-i18n="nav.services">Services</h1>

      <section
        v-for="service in services"
        :key="service.id"
        class="jlz-page-section uk-section uk-section-small uk-section-large@m jlz-service-frame"
        :id="`section-services-${service.id}`"
        :data-page-section="`services-${service.id}`"
        :data-service-frame="service.id"
        :class="{ 'section-active': activeSectionId === `services-${service.id}` }"
      >
        <div class="uk-container uk-container-expand uk-padding jlz-service-room">
          <header class="jlz-service-heading">
            <h2 class="studio-title" :data-i18n="service.title">Service</h2>
            <p class="jlz-service-lead" :data-i18n="service.lead">
              Clear direction. Built to perform.
            </p>
          </header>

          <div class="jlz-service-dossier">
            <div class="jlz-service-dossier__top">
              <span :id="`services-deliverables-${service.id}`" data-i18n="services.deliverables">
                WHAT WE DO
              </span>
              <span>{{ service.number }} <i>/ 04</i></span>
            </div>
            <p class="jlz-service-result" :data-i18n="service.result">
              A clear result, made useful.
            </p>
            <ul
              class="jlz-service-capabilities"
              :aria-labelledby="`services-deliverables-${service.id}`"
            >
              <li v-for="(key, index) in service.capabilities" :key="key">
                <span>0{{ index + 1 }}</span
                ><b :data-i18n="key">Capability</b>
              </li>
            </ul>
            <a
              v-if="!rendererAvailable"
              :href="blogHref(service.href)"
              class="jlz-service-fallback"
              data-i18n="common.explore"
            >
              Explore
            </a>
          </div>
        </div>
      </section>

      <NavMenu mode="content" :active-section-id="activeSectionId" />
    </article>
  </main>
</template>
