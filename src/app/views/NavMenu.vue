<script setup lang="ts">
// src/app/views/NavMenu.vue — Phase 5: navigation sheet SFC (canonical
// section 5, the menu face). 1:1 port of the former string page
// The menu is intentionally flat: each item is a direct route destination;
// `mode` switches
// the section attribute namespace: 'home' = data-section (3D cube-face
// sync), 'content' = data-page-section. The root `id`/`data-cinematic-menu`
// stay constant; the page class is added only on content pages so the
// standard hiding rule applies there (legacy comment, kept).
defineProps<{ mode: 'home' | 'content' }>()

import { NAV_ITEMS } from '../navItems'
</script>

<template>
  <section
    id="section-menu"
    class="jlz-menu-overlay uk-section uk-section-xsmall uk-flex uk-flex-column"
    :class="{ 'jlz-page-section': mode === 'content' }"
    :data-section="mode === 'home' ? 'menu' : undefined"
    :data-page-section="mode === 'content' ? 'page-menu' : undefined"
    data-cinematic-menu
  >
    <div class="jlz-menu-field" aria-hidden="true">
      <span class="jlz-menu-field__horizon"></span>
      <span class="jlz-menu-field__pulse"></span>
    </div>
    <div
      class="uk-container uk-container-expand jlz-menu-container uk-flex uk-flex-column uk-flex-center"
    >
      <div class="jlz-menu-sheet__header uk-flex uk-flex-between uk-margin-bottom">
        <span
          class="jlz-menu-sheet__eyebrow uk-text-meta uk-text-uppercase"
          data-i18n="menu.navigate"
          >Menu</span
        >
        <span class="jlz-menu-sheet__index uk-text-meta uk-text-uppercase" aria-hidden="true"
          >Index / 07</span
        >
      </div>
      <!-- Main 2-column grid: stat | top-level navigation -->
      <div class="jlz-menu-grid uk-grid uk-grid-medium uk-flex uk-flex-middle" uk-grid>
        <div
          class="jlz-menu-col jlz-menu-col--stat uk-flex uk-flex-column uk-width-1-1 uk-width-2-5@m uk-visible@m"
        >
          <div class="jlz-menu-preview" aria-hidden="true">
            <span class="jlz-menu-preview__number">01</span>
            <span class="jlz-menu-preview__label">Studio</span>
            <span class="jlz-menu-preview__cursor"></span>
            <span class="jlz-menu-preview__echo">ENTER THE WORLD</span>
          </div>
        </div>
        <div
          class="jlz-menu-col jlz-menu-col--nav uk-flex uk-flex-column uk-width-1-1 uk-width-expand@m"
        >
          <ul class="jlz-menu-nav uk-nav uk-nav-default">
            <li v-for="item in NAV_ITEMS" :key="item.num" class="jlz-menu-nav__item">
              <a
                :href="item.href"
                class="jlz-menu-nav__toggle jlz-menu-nav__direct-link uk-flex uk-width-1-1"
                data-magnetic
                data-page-transition
              >
                <span class="jlz-menu-nav__num">{{ item.num }}</span>
                <span class="jlz-menu-nav__label" :data-i18n="item.labelKey">{{ item.label }}</span>
                <span class="jlz-menu-nav__arrow" aria-hidden="true">→</span>
              </a>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </section>
</template>
