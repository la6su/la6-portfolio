<script setup lang="ts">
import * as THREE from 'three'
import { onBeforeUnmount, onMounted, shallowRef, toRaw } from 'vue'
import { ServicesStage } from '../../Experience/World/ServicesStage'

const props = defineProps<{ stage: ServicesStage }>()
const parts = shallowRef<THREE.Mesh[]>([])
const rings = shallowRef<THREE.Mesh[]>([])
const ringConfigs = [
  [1.5, 0.3, 0],
  [2.2, -0.5, 0.4],
  [2.8, 0.8, -0.3],
] as const

onMounted(() => {
  const stage = toRaw(props.stage)
  parts.value.forEach((part) => part.position.set(0, 0, 0))
  rings.value.forEach((ring, index) => {
    const [radius, rotX, rotZ] = ringConfigs[index]!
    ring.scale.setScalar(radius)
    ring.rotation.set(rotX, 0, rotZ)
    ring.position.z = -1
  })
  stage.adopt({ parts: parts.value, rings: rings.value })
})

onBeforeUnmount(() => {
  parts.value = []
  rings.value = []
})
</script>

<template>
  <TresGroup name="services-stage-geometry" :dispose="null">
    <TresMesh
      v-for="index in 7"
      :key="`service-part-${index}`"
      ref="parts"
      :material="index === 4 ? stage.signalMaterial : stage.metalMaterial"
    >
      <TresBoxGeometry :args="[0.8, 0.8, 0.08]" />
    </TresMesh>
    <TresMesh
      v-for="(_, index) in ringConfigs"
      :key="`service-ring-${index}`"
      ref="rings"
      :name="`services-orbit-${index}`"
      :material="stage.orbitMaterials[index]"
    >
      <TresTorusGeometry :args="[1, 0.012, 8, 64]" />
    </TresMesh>
  </TresGroup>
</template>
