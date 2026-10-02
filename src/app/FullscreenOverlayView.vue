<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import UIkit from "../core/uikit";
import { eventBus } from "../core/EventBus";
import { getLang, t } from "../core/i18n";

const container = ref<HTMLDivElement | null>(null);
const language = ref(getLang());
const labels = computed(() => {
  return {
    language: language.value.toLowerCase(),
    viewer: t("common.fullscreenViewer"),
    close: t("common.close"),
    previous: t("common.previous"),
    next: t("common.next"),
  };
});
let unsubscribeLanguage: (() => void) | undefined;

onMounted(() => {
  if (container.value) {
    UIkit.update(container.value);
  }
  unsubscribeLanguage = eventBus.on("jlz:lang-change", () => {
    language.value = getLang();
  });
});

onBeforeUnmount(() => {
  unsubscribeLanguage?.();
  eventBus.emit("jlz:fullscreen-overlay-unmounted");
});
</script>

<template>
  <div
    id="jlz-fs-overlay"
    ref="container"
    uk-modal="bg-close: true; esc-close: true; stack: false"
    data-no-magnetic
    class="jlz-fs-overlay uk-modal uk-modal-full uk-light"
    role="dialog"
    aria-modal="true"
    :lang="labels.language"
    :aria-label="labels.viewer"
  >
    <div class="uk-modal-dialog jlz-fs-dialog">
      <button
        class="uk-modal-close-full uk-close-large jlz-fs-close"
        type="button"
        :aria-label="labels.close"
      >
        <span uk-icon="icon: close; ratio: 1.25" aria-hidden="true"></span>
      </button>
      <header class="jlz-fs-meta uk-flex uk-flex-between uk-flex-bottom">
        <div>
          <div class="jlz-fs-cat uk-text-meta uk-text-uppercase"></div>
          <h2 class="jlz-fs-title uk-heading-small uk-margin-remove"></h2>
          <p
            class="jlz-fs-desc uk-visible@s uk-text-truncate uk-margin-small-top uk-margin-remove-bottom"
          ></p>
        </div>
        <div class="jlz-fs-meta-end uk-visible@s uk-text-right">
          <div class="jlz-fs-counter uk-text-meta"></div>
          <div
            class="jlz-fs-tags uk-flex uk-flex-wrap uk-flex-right uk-margin-small-top"
          ></div>
        </div>
      </header>
      <main class="jlz-fs-media-stage uk-position-relative">
        <div class="jlz-fs-poster uk-position-cover" aria-hidden="true"></div>
      </main>
      <button
        class="jlz-nav-arrow jlz-fs-prev uk-flex uk-flex-middle uk-flex-center"
        type="button"
        :aria-label="labels.previous"
      >
        <span uk-icon="icon: slidenav-previous-large" aria-hidden="true"></span>
      </button>
      <button
        class="jlz-nav-arrow jlz-fs-next uk-flex uk-flex-middle uk-flex-center"
        type="button"
        :aria-label="labels.next"
      >
        <span uk-icon="icon: slidenav-next-large" aria-hidden="true"></span>
      </button>
    </div>
  </div>
</template>
