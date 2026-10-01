<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, toRaw } from 'vue'
import type { Group, Mesh } from 'three'
import type { PointerInkStage } from '../../Experience/World/PointerInkStage'

const props = defineProps<{ stage: PointerInkStage }>()
const root = shallowRef<Group | null>(null)
const inkMesh = shallowRef<Mesh | null>(null)

onMounted(() => {
  if (!root.value || !inkMesh.value) {
    throw new Error('Declarative pointer ink stage did not mount completely.')
  }
  props.stage.bindNodes(toRaw(root.value), toRaw(inkMesh.value))
})

onBeforeUnmount(() => {
  if (root.value) props.stage.unbindNodes(toRaw(root.value))
})
</script>

<template>
  <TresGroup ref="root" :name="stage.stageName" :visible="false" :dispose="null">
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
