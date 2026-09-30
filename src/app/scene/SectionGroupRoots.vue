<script setup lang="ts">
import { onMounted, shallowRef } from 'vue'
import type { Group } from 'three'

const emit = defineEmits<{ ready: [groups: Group[]] }>()
const groups = shallowRef<Group[]>([])
const names = [
  'section-lab',
  'section-intro',
  'section-about',
  'section-works',
  'section-contact',
  'section-menu',
]

onMounted(() => {
  const mounted = groups.value
  if (mounted.length !== names.length)
    throw new Error('Declarative section roots did not mount completely.')
  emit('ready', mounted)
})
</script>

<template>
  <TresGroup v-for="name in names" :key="name" ref="groups" :name="name" />
</template>
