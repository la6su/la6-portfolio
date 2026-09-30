<script setup lang="ts">
import { useTresContext } from '@tresjs/core'
import { onMounted, shallowRef } from 'vue'
import type { PerspectiveCamera } from 'three'

const emit = defineEmits<{ ready: [camera: PerspectiveCamera] }>()
const context = useTresContext()
const camera = shallowRef<PerspectiveCamera | null>(null)

onMounted(() => {
  if (!camera.value) throw new Error('Declarative cinematic camera did not mount.')
  // Tres registers declarative cameras as scene children. Promote this one so
  // a short-lived fallback camera, if Tres created one during renderer setup,
  // can never remain active for the project render path.
  context.camera.setActiveCamera(camera.value)
  emit('ready', camera.value)
})
</script>

<template>
  <TresPerspectiveCamera ref="camera" name="cinematic-camera" :fov="75" :near="0.1" :far="1000" />
</template>
