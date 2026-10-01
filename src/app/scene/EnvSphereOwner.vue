<script setup lang="ts">
import { markRaw, onBeforeUnmount, onMounted } from 'vue'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { traceDevLifecycle } from '../../core/devLifecycleTrace'
import {
  EnvSphere,
  PAVILION_ROUNDING,
  PAVILION_SURFACES,
} from '../../Experience/World/EnvSphere'

const emit = defineEmits<{ ready: [owner: EnvSphere] }>()
const owner = markRaw(new EnvSphere())
const surfaces = PAVILION_SURFACES.map((surface) => ({
  ...surface,
  geometry: markRaw(
    new RoundedBoxGeometry(
      ...surface.size,
      PAVILION_ROUNDING.segments,
      PAVILION_ROUNDING.radius,
    ),
  ),
}))

onMounted(() => emit('ready', owner))

onBeforeUnmount(() => {
  surfaces.forEach(({ geometry }) => geometry.dispose())
  owner.dispose()
  if (import.meta.env.DEV) traceDevLifecycle('scene-owner:env-sphere-disposed')
})
</script>

<template>
  <TresGroup name="env-pavilion">
    <TresMesh
      v-for="surface in surfaces"
      :key="surface.name"
      :name="surface.name"
      :geometry="surface.geometry"
      :material="owner.materials[surface.material]"
      :position="surface.position"
      :render-order="-1000"
      :frustum-culled="false"
      :dispose="null"
    />
  </TresGroup>
</template>
