<script setup lang="ts">
import { onMounted, shallowRef } from 'vue'
import type { Mesh, MeshStandardMaterial, PlaneGeometry } from 'three'
import type { GroundPlaneNode } from '../../Experience/Scene/GroundPlane'

const emit = defineEmits<{ ready: [node: GroundPlaneNode] }>()
const ground = shallowRef<Mesh<PlaneGeometry, MeshStandardMaterial> | null>(null)
const GROUND_ROTATION: [number, number, number] = [-Math.PI / 2, 0, 0]

onMounted(() => {
  if (!ground.value) throw new Error('Declarative ground plane did not mount.')
  emit('ready', ground.value)
})
</script>

<template>
  <TresMesh
    ref="ground"
    name="ground"
    :position="[0, -1, 0]"
    :rotation="GROUND_ROTATION"
  >
    <TresPlaneGeometry :args="[200, 200]" />
    <TresMeshStandardMaterial
      :color="0x000000"
      :transparent="true"
      :depth-write="false"
      :opacity="0.3"
      :roughness="1"
      :metalness="0"
    />
  </TresMesh>
</template>
