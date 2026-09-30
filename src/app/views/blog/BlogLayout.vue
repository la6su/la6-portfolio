<script setup lang="ts">
// src/app/views/blog/BlogLayout.vue — Phase 9, slice 4: the shared shell of
// the static blog pages (the SSG content pipeline). One layout for the index
// and the articles; the only variant differences are the secondary nav item
// (the index links back to the landing page, the articles to the 3D app) and
// the footer social row (articles only). Prerender-only: this SFC is rendered
// to static HTML by `scripts/prerender-blog.mjs` and is never mounted by the
// app — the blog documents carry no application JS and load no 3D.
defineProps<{
  variant: 'index' | 'article'
}>()
</script>

<template>
  <div class="jlz-reading-progress" aria-hidden="true">
    <div class="jlz-reading-progress__bar"></div>
  </div>
  <a href="#main" class="skip-link">Skip to main content</a>

  <header class="jlz-blog-header" role="banner">
    <nav
      class="uk-container uk-container-expand uk-navbar uk-navbar-transparent"
      uk-navbar
      aria-label="Main navigation"
    >
      <div class="uk-navbar-left">
        <a href="/" class="uk-navbar-item uk-logo jlz-blog-brand">l@6</a>
      </div>
      <div class="uk-navbar-right">
        <ul class="uk-navbar-nav">
          <li><a href="/blog">Blog</a></li>
          <li v-if="variant === 'index'"><a href="/">Enter studio ↗</a></li>
          <li v-else><a href="/">Enter 3D →</a></li>
        </ul>
      </div>
    </nav>
  </header>

  <slot />

  <footer class="jlz-blog-footer" role="contentinfo">
    <div class="uk-container uk-container-expand uk-text-center">
      <!-- Inline SVGs: the prerendered documents carry no JavaScript, so
           uk-icon (a UIkit JS component) never renders there. -->
      <ul v-if="variant === 'article'" class="jlz-blog-social" aria-label="Social links">
        <li>
          <a href="https://github.com/la6su" rel="noopener" aria-label="GitHub">
            <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
              <path
                fill="currentColor"
                d="M10,1 C5.03,1 1,5.03 1,10 C1,13.98 3.58,17.35 7.16,18.54 C7.61,18.62 7.77,18.34 7.77,18.11 C7.77,17.9 7.76,17.33 7.76,16.58 C5.26,17.12 4.73,15.37 4.73,15.37 C4.32,14.33 3.73,14.05 3.73,14.05 C2.91,13.5 3.79,13.5 3.79,13.5 C4.69,13.56 5.17,14.43 5.17,14.43 C5.97,15.8 7.28,15.41 7.79,15.18 C7.87,14.6 8.1,14.2 8.36,13.98 C6.36,13.75 4.26,12.98 4.26,9.53 C4.26,8.55 4.61,7.74 5.19,7.11 C5.1,6.88 4.79,5.97 5.28,4.73 C5.28,4.73 6.04,4.49 7.75,5.65 C8.47,5.45 9.24,5.35 10,5.35 C10.76,5.35 11.53,5.45 12.25,5.65 C13.97,4.48 14.72,4.73 14.72,4.73 C15.21,5.97 14.9,6.88 14.81,7.11 C15.39,7.74 15.73,8.54 15.73,9.53 C15.73,12.99 13.63,13.75 11.62,13.97 C11.94,14.25 12.23,14.8 12.23,15.64 C12.23,16.84 12.22,17.81 12.22,18.11 C12.22,18.35 12.38,18.63 12.84,18.54 C16.42,17.35 19,13.98 19,10 C19,5.03 14.97,1 10,1 L10,1 Z"
              />
            </svg>
          </a>
        </li>
        <li>
          <a href="https://x.com/justlovejazz" rel="noopener" aria-label="Twitter">
            <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
              <path
                fill="currentColor"
                d="M19,4.74 C18.339,5.029 17.626,5.229 16.881,5.32 C17.644,4.86 18.227,4.139 18.503,3.28 C17.79,3.7 17.001,4.009 16.159,4.17 C15.485,3.45 14.526,3 13.464,3 C11.423,3 9.771,4.66 9.771,6.7 C9.771,6.99 9.804,7.269 9.868,7.539 C6.795,7.38 4.076,5.919 2.254,3.679 C1.936,4.219 1.754,4.86 1.754,5.539 C1.754,6.82 2.405,7.95 3.397,8.61 C2.79,8.589 2.22,8.429 1.723,8.149 L1.723,8.189 C1.723,9.978 2.997,11.478 4.686,11.82 C4.376,11.899 4.049,11.939 3.713,11.939 C3.475,11.939 3.245,11.919 3.018,11.88 C3.49,13.349 4.852,14.419 6.469,14.449 C5.205,15.429 3.612,16.019 1.882,16.019 C1.583,16.019 1.29,16.009 1,15.969 C2.635,17.019 4.576,17.629 6.662,17.629 C13.454,17.629 17.17,12 17.17,7.129 C17.17,6.969 17.166,6.809 17.157,6.649 C17.879,6.129 18.504,5.478 19,4.74"
              />
            </svg>
          </a>
        </li>
        <li>
          <a href="mailto:hello@justlovejazz.com" aria-label="Email">
            <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
              <polyline fill="none" stroke="currentColor" points="1.4,6.5 10,11 18.6,6.5" />
              <path
                fill="none"
                stroke="currentColor"
                d="M 1,4 1,16 19,16 19,4 1,4 Z M 18,15 2,15 2,5 18,5 18,15 Z"
              />
            </svg>
          </a>
        </li>
      </ul>
      <p class="uk-text-meta uk-margin-small-top">
        © <span id="year">2026</span> JUSTLOVEJAZZ — Web Design Studio
      </p>
    </div>
  </footer>
</template>
