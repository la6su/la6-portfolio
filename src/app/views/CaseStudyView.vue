<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount, onMounted } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { CASE_STUDIES, CASE_STUDY_BY_PROJECT } from '../../Data/CaseStudies'
import { PROJECTS } from '../../Data/Projects'
import { setWorksCaseProject } from '../../core/worksExperience'
import { eventBus } from '../../core/EventBus'
import { getLang } from '../../core/i18n'
import { localizedPath } from '../../core/routeManifest'
import { applyMetaTags } from '../../core/pageMeta'
import { useJlzPage } from '../useJlzPage'
import ContactFooter from './ContactFooter.vue'
import NavMenu from './NavMenu.vue'
import { rendererAvailable } from '../../core/rendererAvailability'

const rootEl = ref<HTMLElement | null>(null)
const route = useRoute()
const projectId = computed(() => String(route.params.projectId ?? ''))
const study = computed(() => CASE_STUDY_BY_PROJECT.get(projectId.value))
const projectIndex = computed(() => PROJECTS.findIndex((item) => item.id === projectId.value))
const project = computed(() => PROJECTS[projectIndex.value])
const related = computed(() => CASE_STUDIES.filter((item) => item.projectId !== projectId.value))
const language = ref(getLang())
const localizedStudy = computed(() => {
  const current = study.value
  if (!current) return null
  return language.value === 'RU' ? current.ru : current
})
let unsubscribe = (): void => undefined
const applyCaseStudyMeta = (): void => {
  const published = Boolean(project.value && study.value)
  const title = published ? `${project.value!.title} — JUSTLOVEJAZZ` : labels.value.unavailableTitle
  const description =
    published && localizedStudy.value
      ? localizedStudy.value.outcome
      : labels.value.unavailableDescription
  applyMetaTags('works', {
    title,
    description,
    canonicalPath: published ? `/works/${projectId.value}` : '/works',
    type: published ? 'article' : 'website',
    robots: published ? undefined : 'noindex,follow',
  })
}
onBeforeUnmount(() => {
  unsubscribe()
})
const labels = computed(() =>
  language.value === 'RU'
    ? {
        back: 'Все работы',
        chapters: ['Замысел', 'Устройство', 'Материал', 'Вывод'],
        study: 'Избранная работа',
        role: 'Роль',
        question: 'Отправная точка.',
        response: 'Решение',
        constraints: 'Условия',
        material: 'Ближе к материалу.',
        view: 'Открыть материал',
        result: 'Что получилось.',
        next: 'Продолжить исследование',
        contact: 'Обсудить похожий проект',
        constraintNote: 'Условие, учтённое при разработке',
        clientProject: 'Клиентский проект',
        unavailableTitle: 'Работы — JUSTLOVEJAZZ',
        unavailableDescription: 'Запрошенный кейс недоступен.',
        unavailable: 'Кейс ещё не подготовлен',
        status: 'Материалы проекта готовятся к публикации.',
      }
    : {
        back: 'All works',
        chapters: ['Intent', 'System', 'Material', 'Reflection'],
        study: 'Selected work',
        role: 'Role',
        question: 'The starting point.',
        response: 'The response',
        constraints: 'Constraints',
        material: 'A closer look.',
        view: 'Expand the material',
        result: 'What remains.',
        next: 'Continue exploring',
        contact: 'Discuss a similar project',
        constraintNote: 'Constraint carried into the build',
        clientProject: 'Client project',
        unavailableTitle: 'Works — JUSTLOVEJAZZ',
        unavailableDescription: 'The requested case study is not available.',
        unavailable: 'Case study not yet available',
        status: 'Project material is being prepared for publication.',
      },
)
const open = (): void => eventBus.emit('jlz:open-project', { idx: projectIndex.value })

// Set intent before useJlzPage publishes route readiness. Reused detail routes
// re-publish after their DOM changes so the cinematic track is rebuilt once.
let releaseCaseIntent = (): void => undefined
if (!import.meta.env.SSR) {
  releaseCaseIntent = setWorksCaseProject(projectIndex.value >= 0 ? projectIndex.value : null)
}
onBeforeUnmount(() => releaseCaseIntent())
const activeSectionId = useJlzPage('works', () => rootEl.value, 'case-1')
onMounted(() => {
  unsubscribe = eventBus.on('jlz:lang-change', () => {
    language.value = getLang()
  })
  applyCaseStudyMeta()
})
watch(
  projectId,
  () => {
    releaseCaseIntent()
    releaseCaseIntent = setWorksCaseProject(projectIndex.value >= 0 ? projectIndex.value : null)
    eventBus.emit('jlz:route-change')
  },
  { flush: 'post' },
)
watch([project, study], applyCaseStudyMeta, { flush: 'post' })
watch(language, applyCaseStudyMeta, { flush: 'post' })
</script>

<template>
  <main id="spa-content" ref="rootEl" tabindex="-1" class="uk-position-relative" data-page-view="content">
    <article class="jlz-page jlz-case-study-page" data-page-view="case-study" :data-case-project="projectId">
      <ContactFooter mode="content" :active-section-id="activeSectionId" />
      <template v-if="study && project && localizedStudy">
        <section
          v-for="(chapter, index) in labels.chapters"
          :key="index"
          :id="`section-case-${index + 1}`"
          :data-page-section="`case-${index + 1}`"
          class="jlz-page-section jlz-case-chapter"
          :class="{ 'section-active': activeSectionId === `case-${index + 1}` }"
        >
          <div class="jlz-works-stage uk-container uk-container-expand">
            <header class="jlz-works-coordinate uk-flex uk-flex-between">
              <RouterLink class="uk-link-text" :to="localizedPath(language, '/works')">← {{ labels.back }}</RouterLink>
              <span>0{{ index + 1 }} / {{ chapter }}</span>
            </header>
            <div class="jlz-works-heading">
              <p class="jlz-works-discipline">
                {{ index === 0 ? labels.study : project.title }}
              </p>
              <h1 v-if="index === 0" class="jlz-works-title">
                {{ project.title }}
              </h1>
              <h2 v-else class="jlz-works-title jlz-case-title">
                {{ index === 1 ? labels.question : index === 2 ? labels.material : labels.result }}
              </h2>
            </div>
            <div class="jlz-works-narrative jlz-case-copy" :lang="language === 'RU' ? 'ru' : 'en'">
              <template v-if="index === 0">
                <p class="jlz-works-premise">{{ localizedStudy.outcome }}</p>
                <p class="jlz-works-context">{{ localizedStudy.role }}</p>
                <p class="jlz-works-discipline uk-margin-top">
                  {{ localizedStudy.stack.join(' / ') }}
                </p>
                <dl class="jlz-case-facts uk-description-list uk-margin-top">
                  <template v-for="item in localizedStudy.constraints" :key="item">
                    <dt>{{ item }}</dt>
                    <dd>{{ labels.constraintNote }}</dd>
                  </template>
                </dl>
              </template>
              <template v-else-if="index === 1">
                <p class="jlz-works-premise">{{ localizedStudy.problem }}</p>
                <p class="jlz-works-context">{{ localizedStudy.response }}</p>
                <ul class="uk-accordion jlz-case-notes" uk-accordion>
                  <li>
                    <a class="uk-accordion-title" href="#">{{ labels.constraints }}</a>
                    <div class="uk-accordion-content">
                      <ul class="uk-list">
                        <li v-for="item in localizedStudy.constraints" :key="item">
                          {{ item }}
                        </li>
                      </ul>
                    </div>
                  </li>
                </ul>
              </template>
              <template v-else-if="index === 2">
                <p class="jlz-works-premise">{{ localizedStudy.context }}</p>
                <ul class="jlz-case-proof uk-list uk-list-divider uk-margin-top">
                  <li v-for="proof in localizedStudy.proof" :key="proof.label">
                    <span>{{ proof.label }}</span
                    ><strong>{{ proof.value }}</strong>
                  </li>
                </ul>
                <figure v-if="localizedStudy.media[0]" class="jlz-case-media uk-margin-top">
                  <img
                    :src="project.detailTextureUrl"
                    :alt="localizedStudy.media[0].alt"
                    :width="localizedStudy.media[0].width"
                    :height="localizedStudy.media[0].height"
                    loading="lazy"
                  />
                  <figcaption>
                    {{ localizedStudy.media[0].caption ?? labels.material }}
                  </figcaption>
                </figure>
                <button v-if="rendererAvailable" type="button" class="uk-button uk-button-text jlz-works-enter" @click="open">
                  {{ labels.view }} ⤢
                </button>
              </template>
              <template v-else>
                <p class="jlz-works-premise">{{ localizedStudy.result }}</p>
                <p class="jlz-case-status">{{ labels.status }}</p>
                <RouterLink :to="localizedPath(language, '/contact')" class="uk-button uk-button-text jlz-works-enter"
                  >{{ labels.contact }} ↗</RouterLink
                >
                <nav class="jlz-case-related" :aria-label="labels.next">
                  <RouterLink
                    v-for="item in related"
                    :key="item.projectId"
                    class="uk-link-muted"
                    :to="localizedPath(language, `/works/${item.projectId}`)"
                    >{{ PROJECTS.find((p) => p.id === item.projectId)?.title }} ↗</RouterLink
                  >
                </nav>
              </template>
            </div>
            <button
              v-if="rendererAvailable"
              type="button"
              class="jlz-works-aperture"
              @click="open"
              :aria-label="`${labels.view}: ${project.title}`"
              data-cursor="view"
            ></button>
            <footer class="jlz-works-footnote">
              <span>{{ project.year }} / {{ labels.clientProject }}</span
              ><span>{{ project.title }} — 0{{ index + 1 }} / 04</span>
            </footer>
          </div>
        </section>
      </template>
      <section
        v-else
        class="jlz-page-section"
        data-page-section="case-unavailable"
        :class="{ 'section-active': activeSectionId === 'case-unavailable' }"
      >
        <div class="uk-container">
          <h1>{{ labels.unavailable }}</h1>
          <RouterLink :to="localizedPath(language, '/works')">← {{ labels.back }}</RouterLink>
        </div>
      </section>
      <NavMenu mode="content" :active-section-id="activeSectionId" />
    </article>
  </main>
</template>
