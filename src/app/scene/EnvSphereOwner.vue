<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, markRaw } from 'vue'
import { EnvSphere } from '../../Experience/World/EnvSphere'

const emit = defineEmits<{ ready: [owner: EnvSphere] }>()
const owner = shallowRef<EnvSphere | null>(null)

onMounted(() => {
  const sphere = markRaw(new EnvSphere())
  owner.value = sphere
  emit('ready', sphere)
})

onBeforeUnmount(() => {
  owner.value?.dispose()
  owner.value = null
})
</script>

<template>
  <primitive v-if="owner" :object="owner" :dispose="null" />
</template>
