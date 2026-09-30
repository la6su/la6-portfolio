<script setup lang="ts">
// src/app/views/HomeView.vue — Phase 5: home route SFC (the 3D cube
// experience face. The four main sections form the native horizontal story
// track; sections 0/5 enter as Contact/Menu sheets. The
// section order matches the displayed cube orientation (see
// src/core/routeManifest.ts). The scene sync reads `data-section`
// on these nodes — the attributes are the 3D contract.
import { ref } from 'vue'

import { useJlzPage } from '../useJlzPage'
import ContactFooter from './ContactFooter.vue'
import NavMenu from './NavMenu.vue'

const rootEl = ref<HTMLElement | null>(null)
useJlzPage('home', () => rootEl.value)
</script>

<template>
  <main
    id="spa-content"
    ref="rootEl"
    role="main"
    class="uk-position-relative"
    data-page-view="home"
    uk-height-viewport
  >
    <!-- ═══ 6 child sections (4 story frames + 2 sheets) — 1:1 cube states ═══ -->
    <ContactFooter mode="home" />

    <!-- 01 · Studio (front face +Z, start section) -->
    <section
      class="uk-section uk-section-small uk-section-large@m"
      id="section-intro"
      data-section="intro"
    >
      <div
        class="uk-container uk-container-expand uk-padding uk-flex uk-flex-column uk-flex-between uk-height-1-1"
      >
        <div class="jlz-section-top uk-text-center uk-flex uk-flex-column uk-flex-middle">
          <span class="jlz-eyebrow uk-display-inline-block" data-eyebrow data-eyebrow-text="01"
            >01</span
          >
          <h2
            class="studio-title uk-heading-xlarge uk-margin-small-top uk-margin-remove-bottom"
            data-i18n="home.studio.title"
          >
            Studio
          </h2>
          <p class="uk-text-lead uk-margin-small-top" data-i18n="home.studio.lead">
            Technology with a point of view.
          </p>
        </div>
        <div class="jlz-section-bottom">
          <div class="jlz-cinematic-shell">
            <div>
              <span aria-hidden="true">></span>
            </div>
            <div>
              <div class="jlz-desc uk-margin-small-top">
                <p class="uk-text-meta uk-margin-remove" data-i18n="home.studio.desc1">
                  Distinctive digital solutions for your business.
                </p>
                <p class="uk-text-meta uk-margin-remove" data-i18n="home.studio.desc2">
                  Creative direction. Automation. Performance.
                </p>
              </div>
              <div class="uk-margin-top">
                <button
                  type="button"
                  class="jlz-showreel-btn"
                  id="jlz-showreel-trigger"
                  data-cursor="play"
                  aria-haspopup="dialog"
                >
                  <span class="jlz-showreel-btn__bracket" aria-hidden="true">[</span>
                  <span class="jlz-showreel-btn__glyph" aria-hidden="true">▶</span>
                  <span class="jlz-showreel-btn__label" data-i18n="home.studio.showreel"
                    >Showreel</span
                  >
                  <span class="jlz-showreel-btn__meta" aria-hidden="true">MP4·2026</span>
                  <span class="jlz-showreel-btn__bracket" aria-hidden="true">]</span>
                  <span class="jlz-showreel-btn__cursor" aria-hidden="true"></span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 02 · Services (right face +X) -->
    <section
      class="uk-section uk-section-small uk-section-large@m"
      id="section-about"
      data-section="about"
    >
      <div
        class="uk-container uk-container-expand uk-padding uk-flex uk-flex-column uk-flex-between uk-height-1-1"
      >
        <div class="jlz-section-top uk-text-center uk-flex uk-flex-column uk-flex-middle">
          <span class="jlz-eyebrow uk-display-inline-block" data-eyebrow data-eyebrow-text="02"
            >02</span
          >
          <h2
            class="studio-title uk-heading-large uk-margin-small-top uk-margin-remove-bottom"
            data-i18n="home.about.title"
          >
            Services
          </h2>
          <p class="uk-text-lead uk-margin-small-top" data-i18n="home.about.lead">
            Your business sets the direction.
          </p>
        </div>
        <div class="jlz-section-bottom">
          <div class="jlz-cinematic-shell">
            <div>
              <span aria-hidden="true">></span>
            </div>
            <div>
              <div class="jlz-service-desc uk-flex uk-flex-column">
                <p class="uk-text-meta uk-margin-remove" data-i18n="home.about.desc1">
                  We turn business context and data into a clear solution.
                </p>
                <p class="uk-text-meta uk-margin-remove" data-i18n="home.about.desc2">
                  Research, design and development in one process.
                </p>
              </div>
              <a
                href="/services"
                class="jlz-service-explore uk-button uk-button-default uk-button-small uk-text-uppercase uk-margin-top uk-flex uk-flex-none uk-flex-inline uk-flex-middle"
              >
                <span
                  class="jlz-service-explore__dot uk-display-inline-block"
                  aria-hidden="true"
                ></span>
                <span data-i18n="common.explore">Explore</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 03 · Works (back face -Z, BakuCarousel) — image-only frame -->
    <section
      class="uk-section uk-section-small uk-section-large@m"
      id="section-works"
      data-section="works"
    >
      <div
        class="uk-container uk-container-expand uk-padding uk-flex uk-flex-column uk-flex-between uk-height-1-1"
      >
        <!-- The title remains in the DOM for native navigation labels and
             assistive technology, but the Works frame itself is
             deliberately image-only. -->
        <h2 id="jlz-works-title" data-i18n="home.works.title" hidden>Works</h2>
        <!-- bottom block: none (3D plane owns the frame) -->
      </div>
      <div
        class="jlz-works-slider-controls uk-position-cover uk-flex uk-flex-middle uk-flex-between"
        role="group"
        aria-labelledby="jlz-works-title"
      >
        <button
          class="jlz-nav-arrow jlz-works-slider-arrow jlz-works-slider-arrow--prev uk-flex uk-flex-middle uk-flex-center"
          type="button"
          data-baku-carousel-control="prev"
          aria-label="Previous work"
          data-cursor="view"
        >
          <span uk-icon="icon: slidenav-previous-large" aria-hidden="true"></span>
        </button>
        <button
          class="jlz-nav-arrow jlz-works-slider-arrow jlz-works-slider-arrow--next uk-flex uk-flex-middle uk-flex-center"
          type="button"
          data-baku-carousel-control="next"
          aria-label="Next work"
          data-cursor="view"
        >
          <span uk-icon="icon: slidenav-next-large" aria-hidden="true"></span>
        </button>
      </div>
      <a href="/works" class="jlz-works-entrance uk-button uk-button-default">
        <span data-i18n="works.enterRooms">Explore the four rooms</span> ↗
      </a>
    </section>

    <!-- 04 · Manifesto (bottom face -Y) -->
    <section
      class="uk-section uk-section-small uk-section-large@m"
      id="section-contact"
      data-section="contact"
    >
      <div
        class="uk-container uk-container-expand uk-padding uk-flex uk-flex-column uk-flex-between uk-height-1-1"
      >
        <div class="jlz-section-top uk-text-center uk-flex uk-flex-column uk-flex-middle">
          <span class="jlz-eyebrow uk-display-inline-block" data-eyebrow data-eyebrow-text="04"
            >04</span
          >
          <h2
            class="studio-title uk-heading-large uk-margin-small-top uk-margin-remove-bottom"
            data-i18n="home.manifesto.title"
          >
            Manifesto
          </h2>
          <p class="uk-text-lead uk-margin-small-top" data-i18n="home.manifesto.lead">
            This is what guides us.
          </p>
        </div>
        <div class="jlz-section-bottom">
          <div class="jlz-cinematic-shell">
            <div>
              <span aria-hidden="true">></span>
            </div>
            <div>
              <div class="jlz-service-desc uk-flex uk-flex-column">
                <p class="uk-text-meta uk-margin-remove" data-i18n="home.manifesto.desc1">
                  Understand the business.
                </p>
                <p class="uk-text-meta uk-margin-remove" data-i18n="home.manifesto.desc2">
                  Give every decision a purpose.
                </p>
                <p class="uk-text-meta uk-margin-remove" data-i18n="home.manifesto.desc3">
                  Make the result clear, fast and distinctive.
                </p>
              </div>
              <a
                href="/manifesto"
                class="jlz-service-explore uk-button uk-button-default uk-button-small uk-text-uppercase uk-margin-top uk-flex uk-flex-none uk-flex-inline uk-flex-middle"
              >
                <span
                  class="jlz-service-explore__dot uk-display-inline-block"
                  aria-hidden="true"
                ></span>
                <span data-i18n="common.explore">Explore</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>

    <NavMenu mode="home" />
  </main>
</template>
