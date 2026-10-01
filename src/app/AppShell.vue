<script setup lang="ts">
// Keep the scene root mounted across route changes; RouterView owns page content.
import { RouterView } from 'vue-router'
import SceneHost from './SceneHost.vue'
import PersistentConsole from './PersistentConsole.vue'
import FullscreenOverlayView from './FullscreenOverlayView.vue'
import ShowreelConsole from './ShowreelConsole.vue'
</script>

<template>
  <SceneHost />
  <PersistentConsole />
  <FullscreenOverlayView />
  <ShowreelConsole />
  <RouterView />
</template>
