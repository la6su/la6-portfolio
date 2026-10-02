<script setup lang="ts">
import { markRaw, onBeforeUnmount, onMounted, shallowRef, toRaw } from 'vue'
import type { Group, Mesh } from 'three'
import { ServicesStage } from '../../Experience/World/ServicesStage'

const emit = defineEmits<{ ready: [stage: ServicesStage] }>()
const stage = markRaw(new ServicesStage())
const root = shallowRef<Group | null>(null)
const parts = shallowRef<Mesh[]>([])
const rings = shallowRef<Mesh[]>([])
const ringConfigs = [
  { radius: 1.5, scale: [1.5, 1.5, 1.5], rotation: [0.3, 0, 0] },
  { radius: 2.2, scale: [2.2, 2.2, 2.2], rotation: [-0.5, 0, 0.4] },
  { radius: 2.8, scale: [2.8, 2.8, 2.8], rotation: [0.8, 0, -0.3] },
] as const

onMounted(() => {
  if (!root.value || parts.value.length !== 7 || rings.value.length !== ringConfigs.length) {
    throw new Error('Declarative services stage did not mount completely.')
  }

  const mountedParts = parts.value.map(toRaw)
  const mountedRings = rings.value.map(toRaw)
  stage.adopt({ root: toRaw(root.value), parts: mountedParts, rings: mountedRings })
  emit('ready', stage)
})

onBeforeUnmount(() => {
  parts.value.forEach((part) => toRaw(part).geometry.dispose())
  rings.value.forEach((ring) => toRaw(ring).geometry.dispose())
  stage.dispose()
})
</script>

<template>
  <TresGroup ref="root" name="services-assembly" :visible="stage.visible" :dispose="null">
    <TresMesh
      v-for="index in 7"
      :key="`service-part-${index}`"
      ref="parts"
      :material="index === 4 ? stage.signalMaterial : stage.metalMaterial"
    >
      <TresBoxGeometry :args="[0.8, 0.8, 0.08]" />
    </TresMesh>
    <TresMesh
      v-for="(ring, index) in ringConfigs"
      :key="`service-ring-${index}`"
      ref="rings"
      :name="`services-orbit-${index}`"
      :material="stage.orbitMaterials[index]"
      :scale="ring.scale"
      :rotation="ring.rotation"
      :position="[0, 0, -1]"
    >
      <TresTorusGeometry :args="[1, 0.012, 8, 64]" />
    </TresMesh>
  </TresGroup>
</template>
