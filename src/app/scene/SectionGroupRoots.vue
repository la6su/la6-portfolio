<script setup lang="ts">
import { onMounted, shallowRef } from 'vue'
import type { Group } from 'three'
import type { JunniParticles } from '../../Experience/World/JunniParticles'
import type { BakuCarousel } from '../../Experience/World/BakuCarousel'
import { WORLD_SLOTS } from '../../core/worldSlots'
import JunniParticlesOwner from './JunniParticlesOwner.vue'
import BakuCarouselOwner from './BakuCarouselOwner.vue'

defineProps<{ particles: JunniParticles | null; carousel: BakuCarousel | null }>()

const emit = defineEmits<{ ready: [groups: Group[]] }>()
const groups = shallowRef<Group[]>([])
const names = WORLD_SLOTS.map(({ id }) => `section-${id}`)

onMounted(() => {
  const mounted = groups.value
  if (mounted.length !== names.length)
    throw new Error('Declarative section roots did not mount completely.')
  emit('ready', mounted)
})
</script>

<template>
  <TresGroup v-for="(name, index) in names" :key="name" ref="groups" :name="name" :visible="index === 1">
    <BakuCarouselOwner v-if="index === 3 && carousel" :carousel="carousel" />
    <JunniParticlesOwner v-if="index === 3 && particles" :stage="particles" />
  </TresGroup>
</template>
