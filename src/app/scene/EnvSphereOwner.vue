<script setup lang="ts">
// Declarative composition of the ambient pavilion. Tres constructs each
// rounded-box surface geometry and disposes it when this owner unmounts;
// EnvSphere keeps the five pavilion materials plus the borrowed sky material
// and drives their section/theme retint, so the template borrows them.
import { markRaw, onBeforeUnmount, onMounted } from 'vue'
import { extend } from '@tresjs/core'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { traceDevLifecycle } from '../../core/devLifecycleTrace'
import { EnvSphere, PAVILION_ROUNDING, PAVILION_SURFACES } from '../../Experience/World/EnvSphere'

// RoundedBoxGeometry is a three addon, so it is not in the catalogue Tres
// builds from the aliased `three` namespace.
extend({ RoundedBoxGeometry })

const emit = defineEmits<{ ready: [owner: EnvSphere] }>()
const owner = markRaw(new EnvSphere())
const surfaces = PAVILION_SURFACES.map((surface) => ({
  ...surface,
  geometryArgs: [...surface.size, PAVILION_ROUNDING.segments, PAVILION_ROUNDING.radius],
}))

onMounted(() => emit('ready', owner))

onBeforeUnmount(() => {
  owner.dispose()
  if (import.meta.env.DEV) traceDevLifecycle('scene-owner:env-sphere-disposed')
})
</script>

<template>
  <!-- The pavilion materials stay runtime-owned: they are passed as mesh props
       (not Tres nodes), so Tres' default disposal releases only the declared
       geometry children. -->
  <TresGroup name="env-pavilion">
    <TresMesh
      v-for="surface in surfaces"
      :key="surface.name"
      :name="surface.name"
      :material="owner.materials[surface.material]"
      :position="surface.position"
      :render-order="-1000"
      :frustum-culled="false"
    >
      <TresRoundedBoxGeometry :args="surface.geometryArgs" />
    </TresMesh>
  </TresGroup>
</template>
