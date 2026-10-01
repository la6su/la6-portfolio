<script setup lang="ts">
// Keep the scene root mounted across route changes; RouterView owns page content.
import { RouterView } from 'vue-router'
import SceneHost from './SceneHost.vue'
</script>

<template>
  <SceneHost />
  <RouterView />
</template>
