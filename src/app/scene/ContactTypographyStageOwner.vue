<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, shallowRef, toRaw } from 'vue'
import type { Group } from 'three'
import type { ContactTypographyStage } from '../../Experience/World/ContactTypographyStage'
import type { WireframeTypography } from '../../Experience/World/WireframeTypography'
import WireframeTypographyOwner from './WireframeTypographyOwner.vue'

const props = defineProps<{ stage: ContactTypographyStage }>()
const root = shallowRef<Group | null>(null)
const typography = shallowRef<WireframeTypography | null>(null)

onMounted(() => {
  if (!root.value) throw new Error('Declarative Contact typography root did not mount.')
  props.stage.bindRoot(toRaw(root.value), async (nextTypography) => {
    typography.value = nextTypography ? toRaw(nextTypography) : null
    await nextTick()
  })
})

onBeforeUnmount(() => {
  if (root.value) props.stage.unbindRoot(toRaw(root.value))
})
</script>

<template>
  <TresGroup ref="root" name="contact-typography-stage" :visible="false">
    <WireframeTypographyOwner v-if="typography" :typography="typography" />
  </TresGroup>
</template>
