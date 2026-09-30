<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import { RouterLink } from 'vue-router'
import { PROJECTS } from '../../Data/Projects'
import { CASE_STUDY_BY_PROJECT } from '../../Data/CaseStudies'
import { WORKS_ROOMS, setWorksCaseProject } from '../../core/worksExperience'
import { eventBus } from '../../core/EventBus'
import { useJlzPage } from '../useJlzPage'
import ContactFooter from './ContactFooter.vue'
import NavMenu from './NavMenu.vue'

const rootEl = ref<HTMLElement | null>(null)
const releaseCaseIntent = setWorksCaseProject(null)
onBeforeUnmount(releaseCaseIntent)
useJlzPage('works', () => rootEl.value)
const number = (value: number): string => String(value).padStart(2, '0')
const open = (idx: number): void => eventBus.emit('jlz:open-project', { idx })
</script>

<template>
  <main id="spa-content" ref="rootEl" data-page-view="content" class="uk-position-relative">
    <article class="jlz-page jlz-works-page" data-page-view="works">
      <ContactFooter mode="content" />
      <h1 class="uk-hidden-visually" data-i18n="works.observatory">An observatory of ideas.</h1>
      <section
        v-for="(room, index) in WORKS_ROOMS"
        :key="room.projectIndex"
        :id="`section-works-${number(index + 1)}`"
        :data-page-section="`works-${number(index + 1)}`"
        class="jlz-page-section jlz-works-section"
        :class="{ 'section-active': index === 0 }"
        :aria-labelledby="`work-title-${index}`"
      >
        <div class="jlz-works-stage uk-container uk-container-expand">
          <header class="jlz-works-coordinate uk-flex uk-flex-between">
            <span data-i18n="works.observatory">An observatory of ideas.</span>
            <span>{{ number(index + 1) }} <span aria-hidden="true">/</span> 04</span>
          </header>
          <div class="jlz-works-heading">
            <p class="jlz-works-discipline">
              {{ PROJECTS[room.projectIndex]!.category }} / {{ PROJECTS[room.projectIndex]!.year }}
            </p>
            <h2 :id="`work-title-${index}`" class="jlz-works-title">
              {{ PROJECTS[room.projectIndex]!.title }}
            </h2>
          </div>
          <div class="jlz-works-narrative">
            <p class="jlz-works-premise" :data-i18n="`works.room${index + 1}.premise`"></p>
            <p class="jlz-works-context" :data-i18n="`works.room${index + 1}.context`"></p>
            <div class="jlz-works-actions uk-flex uk-flex-middle">
              <RouterLink
                v-if="CASE_STUDY_BY_PROJECT.has(PROJECTS[room.projectIndex]!.id)"
                :to="`/works/${PROJECTS[room.projectIndex]!.id}`"
                class="uk-button uk-button-text jlz-works-enter"
              >
                <span data-i18n="works.enterCase">Inside the project</span>
                <span aria-hidden="true">↗</span>
              </RouterLink>
              <button
                type="button"
                class="uk-button uk-button-text"
                @click="open(room.projectIndex)"
              >
                <span data-i18n="works.viewMaterial">View material</span>
                <span aria-hidden="true">⤢</span>
              </button>
            </div>
          </div>
          <button
            type="button"
            class="jlz-works-aperture"
            @click="open(room.projectIndex)"
            :aria-label="`Open project: ${PROJECTS[room.projectIndex]!.title}`"
            data-cursor="view"
          >
            <span class="uk-hidden-visually">{{ PROJECTS[room.projectIndex]!.title }}</span>
          </button>
          <footer class="jlz-works-footnote">
            <span data-i18n="works.experiment"
              >Selected work / art direction + creative development</span
            >
            <span class="jlz-works-scroll" data-i18n="works.continue"
              >Scroll to the next world ↓</span
            >
          </footer>
          <nav v-if="index === 3" class="jlz-works-archive" aria-label="Project archive">
            <span class="jlz-works-discipline" data-i18n="works.archive">The archive</span>
            <button
              v-for="(project, projectIndex) in PROJECTS"
              :key="project.id"
              type="button"
              class="uk-button uk-button-text"
              @click="open(projectIndex)"
            >
              {{ project.title }}
            </button>
          </nav>
        </div>
      </section>
      <NavMenu mode="content" />
    </article>
  </main>
</template>
