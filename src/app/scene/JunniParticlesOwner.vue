<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef } from 'vue'
import type { InstancedMesh } from 'three'
import type { JunniParticles } from '../../Experience/World/JunniParticles'

const props = defineProps<{ stage: JunniParticles }>()
const mesh = shallowRef<InstancedMesh | null>(null)
onMounted(() => { if (mesh.value) props.stage.bindMesh(mesh.value) })
onBeforeUnmount(() => { if (mesh.value) props.stage.unbindMesh(mesh.value) })
</script>

<template>
  <TresInstancedMesh
    ref="mesh"
    :args="[stage.geometry, stage.material, stage.count]"
    :visible="stage.visible"
    name="particles"
    :frustum-culled="false"
    :dispose="null"
  />
</template>
