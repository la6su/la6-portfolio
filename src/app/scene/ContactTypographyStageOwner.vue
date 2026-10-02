<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, shallowRef, toRaw } from 'vue'
import type { ContactTypographyStage } from '../../Experience/World/ContactTypographyStage'
import type { WireframeTypography } from '../../Experience/World/WireframeTypography'
import WireframeTypographyOwner from './WireframeTypographyOwner.vue'

const props = defineProps<{ stage: ContactTypographyStage }>()
const typography = shallowRef<WireframeTypography | null>(null)

onMounted(() => {
  props.stage.bind(async (nextTypography) => {
    typography.value = nextTypography ? toRaw(nextTypography) : null
    await nextTick()
  })
})

onBeforeUnmount(() => props.stage.unbind())
</script>

<template>
  <TresGroup name="contact-typography-stage" :visible="stage.visible">
    <WireframeTypographyOwner v-if="typography" :typography="typography" />
  </TresGroup>
</template>
