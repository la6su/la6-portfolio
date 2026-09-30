<script setup lang="ts">
import { onMounted, shallowRef } from 'vue'
import type { InstancedMesh } from 'three'
import { INTRO_TRACE_COUNT, type IntroLightFramesNodes } from '../../Experience/World/ParticleBurst'

const emit = defineEmits<{ ready: [nodes: IntroLightFramesNodes] }>()
const burst = shallowRef<InstancedMesh | null>(null)

onMounted(() => {
  if (!burst.value) throw new Error('Declarative intro light frames did not mount.')
  emit('ready', { mesh: burst.value })
})
</script>

<template>
  <!-- The trace material is behavior (TSL graph) — the controller assigns it
       onto this leaf when Experience adopts the node. -->
  <TresInstancedMesh
    ref="burst"
    name="intro-light-frames"
    :args="[undefined, undefined, INTRO_TRACE_COUNT]"
    :visible="false"
    :frustum-culled="false"
  >
    <TresPlaneGeometry :args="[1, 1]" />
  </TresInstancedMesh>
</template>
