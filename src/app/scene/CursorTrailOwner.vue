<script setup lang="ts">
import { markRaw, onMounted, shallowRef } from 'vue'
import { BufferAttribute, BufferGeometry, type Group, type Mesh } from 'three'
import type { CursorTrailNodes } from '../../Experience/World/DrawTrail'

const emit = defineEmits<{ ready: [nodes: CursorTrailNodes] }>()
const root = shallowRef<Group | null>(null)
const ribbon = shallowRef<Mesh | null>(null)
// An attribute-less mesh crashes Tres's scene memory sampler
// (calculateMemoryUsage reads geometry.attributes.position.count). The
// placeholder carries the empty position attribute the sampler expects; the
// controller replaces it with the hand-built ribbon geometry at adoption —
// long before the mesh is ever visible or rendered.
const placeholderGeometry = markRaw(new BufferGeometry())
placeholderGeometry.setAttribute('position', new BufferAttribute(new Float32Array(0), 3))

onMounted(() => {
  if (!root.value || !ribbon.value) {
    throw new Error('Declarative cursor trail did not mount completely.')
  }
  emit('ready', { root: root.value, ribbon: ribbon.value })
})
</script>

<template>
  <!-- The hand-built ribbon geometry + TSL signal material are behavior — the
       controller assigns them onto this leaf when Experience adopts the node. -->
  <TresGroup ref="root" name="draw-trail" :visible="false">
    <TresMesh
      ref="ribbon"
      name="trail-ribbon"
      :geometry="placeholderGeometry"
      :frustum-culled="false"
      :render-order="7"
    />
  </TresGroup>
</template>
