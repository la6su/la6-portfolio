<script setup lang="ts">
import { computed, markRaw, toRaw } from 'vue'
import type { WorksPlaneStage } from '../../Experience/World/WorksPlaneStage'
import type { WorksInstallation } from '../../Experience/World/WorksInstallation'
import WorksInstallationNode from './WorksInstallation.vue'

const props = defineProps<{
  stage: WorksPlaneStage | null
  installation: WorksInstallation | null
}>()
const stage = computed(() => (props.stage ? markRaw(toRaw(props.stage)) : null))
const installation = computed(() =>
  props.installation ? markRaw(toRaw(props.installation)) : null,
)
</script>

<template>
  <!-- WorksPlaneStage remains the sole route-lazy TSL/texture/motion owner. -->
  <primitive v-if="stage" :object="stage" :dispose="null">
    <WorksInstallationNode v-if="installation" :installation="installation" />
  </primitive>
</template>
