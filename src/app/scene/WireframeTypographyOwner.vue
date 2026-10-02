<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, toRaw } from 'vue'
import type { Mesh } from 'three'
import type { WireframeTypography } from '../../Experience/World/WireframeTypography'

const props = defineProps<{ typography: WireframeTypography }>()
const meshes = shallowRef<Mesh[]>([])

onMounted(() => {
  props.typography.bindMeshes(meshes.value.map(toRaw))
})

onBeforeUnmount(() => {
  props.typography.unbindMeshes(meshes.value.map(toRaw))
})
</script>

<template>
  <TresGroup name="bubble-text" :position="[-0.15, 0.35, -2.4]" :dispose="null">
    <TresMesh
      v-for="(glyph, index) in typography.renderGlyphs"
      :key="index"
      ref="meshes"
      :geometry="glyph.geometry"
      :material="typography.material"
      :position="[glyph.x, 0, 0]"
      :scale="[0, 0, 0]"
      :frustum-culled="false"
    />
  </TresGroup>
</template>
