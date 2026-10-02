<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, toRaw } from 'vue'
import type { Mesh } from 'three'
import type { PointerInkStage } from '../../Experience/World/PointerInkStage'

const props = defineProps<{ stage: PointerInkStage }>()
const inkMesh = shallowRef<Mesh | null>(null)

onMounted(() => {
  if (!inkMesh.value) {
    throw new Error('Declarative pointer ink mesh did not mount.')
  }
  props.stage.bindMesh(toRaw(inkMesh.value))
})

onBeforeUnmount(() => {
  if (inkMesh.value) props.stage.unbindMesh(toRaw(inkMesh.value))
})
</script>

<template>
  <TresGroup :name="stage.stageName" :visible="stage.visible" :dispose="null">
    <TresMesh
      ref="inkMesh"
      :name="stage.meshName"
      :geometry="stage.geometry"
      :material="stage.material"
      :position="stage.meshPosition"
      :scale="[0.001, 0.001, 0.001]"
      :frustum-culled="false"
      :render-order="1"
      :dispose="null"
    />
  </TresGroup>
</template>
