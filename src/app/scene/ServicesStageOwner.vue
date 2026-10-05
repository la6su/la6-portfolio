<script setup lang="ts">
import { markRaw, onBeforeUnmount, onMounted, shallowRef, toRaw } from 'vue'
import type { Group, Mesh } from 'three'
import { ServicesStage } from '../../Experience/World/ServicesStage'

const emit = defineEmits<{ ready: [stage: ServicesStage] }>()
const stage = markRaw(new ServicesStage())
const root = shallowRef<Group | null>(null)
const parts = shallowRef<Mesh[]>([])
const rings = shallowRef<Mesh[]>([])

onMounted(() => {
  if (!root.value || parts.value.length !== 5 || rings.value.length !== 2) {
    throw new Error('Declarative services stage did not mount completely.')
  }
  stage.adopt({
    root: toRaw(root.value),
    parts: parts.value.map(toRaw),
    rings: rings.value.map(toRaw),
  })
  emit('ready', stage)
})

onBeforeUnmount(() => {
  parts.value.forEach((part) => toRaw(part).geometry.dispose())
  rings.value.forEach((ring) => toRaw(ring).geometry.dispose())
  stage.dispose()
})
</script>

<template>
  <TresGroup ref="root" name="services-signal-sculpture" :dispose="null">
    <TresMesh
      v-for="index in 5"
      :key="`service-node-${index}`"
      ref="parts"
      :material="index === 1 ? stage.signalMaterial : stage.metalMaterial"
      :scale="
        index === 1
          ? [0.84, 0.84, 0.18]
          : [index === 2 ? 0.46 : 0.35, index === 2 ? 0.46 : 0.35, 0.12]
      "
    >
      <TresOctahedronGeometry v-if="index === 1" :args="[0.72, 1]" />
      <TresDodecahedronGeometry v-else-if="index === 2" :args="[0.55, 0]" />
      <TresBoxGeometry v-else :args="[1, 1, 1]" />
    </TresMesh>
    <TresMesh
      v-for="index in 2"
      :key="`services-rail-${index}`"
      ref="rings"
      :name="`services-fixed-rail-${index}`"
      :material="stage.railMaterial"
      :position="[0, 0, index === 1 ? -0.45 : 0.08]"
      :rotation="[index === 1 ? 0 : 1.1, 0, index === 1 ? 0 : 0.4]"
    >
      <TresTorusGeometry :args="[index === 1 ? 1 : 0.78, index === 1 ? 0.009 : 0.006, 6, 72]" />
    </TresMesh>
  </TresGroup>
</template>
