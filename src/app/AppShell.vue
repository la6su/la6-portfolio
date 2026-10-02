<script setup lang="ts">
// Keep the scene root mounted across route changes; RouterView owns page content.
import { ref } from 'vue'
import { RouterView } from 'vue-router'
import ExperienceRuntime from './ExperienceRuntime.vue'
import PersistentConsole from './PersistentConsole.vue'
import FullscreenOverlayView from './FullscreenOverlayView.vue'
import ShowreelConsole from './ShowreelConsole.vue'
import RouteTransitionView from './RouteTransitionView.vue'

const runtimeOwner = ref<InstanceType<typeof ExperienceRuntime> | null>(null)

async function destroyExperience(): Promise<void> {
  await runtimeOwner.value?.destroyRuntime()
}

defineExpose({ destroyExperience })
</script>

<template>
  <ExperienceRuntime ref="runtimeOwner" />
  <PersistentConsole />
  <FullscreenOverlayView />
  <ShowreelConsole />
  <RouteTransitionView />
  <RouterView />
</template>
