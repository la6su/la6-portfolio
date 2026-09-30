<script setup lang="ts">
import { markRaw, onMounted, shallowRef } from 'vue'
import { Euler, Vector3, type Mesh, type MeshStandardMaterial, type PlaneGeometry } from 'three'
import type { GroundPlaneNode } from '../../Experience/Scene/GroundPlane'

const emit = defineEmits<{ ready: [node: GroundPlaneNode] }>()
const ground = shallowRef<Mesh<PlaneGeometry, MeshStandardMaterial> | null>(null)
const position = markRaw(new Vector3(0, -1, 0))
const rotation = markRaw(new Euler(-Math.PI / 2, 0, 0))

onMounted(() => {
  if (!ground.value) throw new Error('Declarative ground plane did not mount.')
  emit('ready', ground.value)
})
</script>

<template>
  <TresMesh ref="ground" name="ground" :position="position" :rotation="rotation">
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
