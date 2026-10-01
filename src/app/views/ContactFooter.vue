<script setup lang="ts">
// Shared Contact finale. Its section identifiers keep renderer synchronization
// and deep links stable; `data-contact-footer` is the styling/interaction hook.
defineProps<{ mode: 'home' | 'content' }>()
</script>

<template>
  <section
    :id="mode === 'home' ? 'section-lab' : 'section-page-lab'"
    :class="mode === 'content' ? 'jlz-page-section' : undefined"
    class="uk-section uk-section-small uk-section-large@m"
    :data-section="mode === 'home' ? 'lab' : undefined"
    :data-page-section="mode === 'content' ? 'page-lab' : undefined"
    data-contact-footer
  >
    <div
      class="uk-container uk-container-expand uk-padding uk-flex uk-flex-column uk-flex-between uk-height-1-1"
    >
      <button
        class="uk-close-large uk-margin-auto-left"
        type="button"
        uk-close
        data-close-cinematic-sheet
        aria-label="Close contact footer"
      ></button>
      <div class="jlz-contact-footer__intro uk-flex uk-flex-column uk-flex-top uk-text-left">
        <span class="jlz-contact-footer__kicker uk-text-uppercase" data-i18n="contactFooter.kicker"
          >Final frame · open channel</span
        >
        <h2
          class="studio-title uk-heading-large uk-margin-small-top uk-margin-remove-bottom"
          data-blur-fade="off"
          data-i18n="contactFooter.title"
        >
          Let’s make something worth remembering.
        </h2>
        <p class="uk-text-lead uk-margin-small-top" data-i18n="contactFooter.lead">
          Tell us where the story should go next.
        </p>
      </div>
      <div class="jlz-contact-footer__actions uk-flex uk-flex-middle uk-width-1-1">
        <a
          class="uk-button uk-button-primary jlz-telegram-cta"
          href="https://t.me/justlovejazz"
          target="_blank"
          rel="noopener"
          data-magnetic
          data-cursor="view"
        >
          <span class="jlz-telegram-cta__halo" aria-hidden="true"></span>
          <span
            class="jlz-telegram-cta__icon"
            uk-icon="icon: commenting; ratio: 1.15"
            aria-hidden="true"
          ></span>
          <span class="jlz-telegram-cta__copy">
            <span class="jlz-telegram-cta__label" data-i18n="contactFooter.telegram">TG</span>
            <span class="jlz-telegram-cta__handle">@justlovejazz</span>
          </span>
        </a>
        <a class="jlz-contact-footer__email" href="mailto:hello@justlovejazz.com"
          >hello@justlovejazz.com<span class="jlz-mail-cta__arrow" aria-hidden="true"> ↗</span></a
        >
      </div>
    </div>
  </section>
</template>
