<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, markRaw } from 'vue'
import { ServicesStage } from '../../Experience/World/ServicesStage'
import ServicesStageGeometry from './ServicesStageGeometry.vue'

const emit = defineEmits<{ ready: [stage: ServicesStage] }>()
const stage = shallowRef<ServicesStage | null>(null)

onMounted(() => {
  const owner = markRaw(new ServicesStage())
  stage.value = owner
  emit('ready', owner)
})

onBeforeUnmount(() => {
  const owner = stage.value
  if (!owner) return
  owner.dispose()
  stage.value = null
})
</script>

<template>
  <primitive v-if="stage" :object="stage" :dispose="null">
    <ServicesStageGeometry :stage="stage" />
  </primitive>
</template>
