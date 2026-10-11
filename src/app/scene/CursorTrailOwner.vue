<script setup lang="ts">
// Declarative composition of the Works cursor trail. Tres constructs the ribbon
// geometry container and the TSL node material and disposes both when this
// owner unmounts; DrawTrail keeps the pointer history, writes the ribbon
// buffers into the declared geometry and feeds the declared material's nodes.
import { onBeforeUnmount, onMounted, shallowRef, toRaw } from 'vue'
import { AdditiveBlending, DoubleSide } from 'three'
import type { BufferGeometry, Mesh } from 'three'
import type { MeshBasicNodeMaterial } from 'three/webgpu'
import { traceDevLifecycle } from '../../core/devLifecycleTrace'
import type { CursorTrailNodes } from '../../Experience/World/DrawTrail'

const emit = defineEmits<{ ready: [nodes: CursorTrailNodes] }>()
const root = shallowRef<CursorTrailNodes['root'] | null>(null)
const ribbon = shallowRef<Mesh<BufferGeometry, MeshBasicNodeMaterial> | null>(null)

onMounted(() => {
  if (!root.value || !ribbon.value) {
    throw new Error('Declarative cursor trail did not mount completely.')
  }
  emit('ready', {
    root: toRaw(root.value),
    ribbon: toRaw(ribbon.value),
  })
  if (import.meta.env.DEV) traceDevLifecycle('scene-owner:cursor-trail-bound')
})

onBeforeUnmount(() => {
  if (import.meta.env.DEV) traceDevLifecycle('scene-owner:cursor-trail-unbound')
})
</script>

<template>
  <!-- The declared container is a 35-segment strip: 36 trail points x 2 ribbon
       edges, which is exactly the ribbon topology DrawTrail writes. Its own
       plane buffers exist from the first frame (Tres' built-in performance
       sampler reads `geometry.attributes.position` on every RAF tick) and
       DrawTrail replaces them with the pointer-driven buffers. -->
  <!-- Hidden until SceneTransformPass gates the works trail on via setVisible. -->
  <TresGroup ref="root" name="draw-trail" :visible="false">
    <TresMesh ref="ribbon" name="trail-ribbon" :frustum-culled="false" :render-order="7">
      <TresPlaneGeometry :args="[1, 1, 35, 1]" />
      <TresMeshBasicNodeMaterial
        :transparent="true"
        :depth-write="false"
        :depth-test="false"
        :blending="AdditiveBlending"
        :side="DoubleSide"
        :fog="false"
        :tone-mapped="false"
      />
    </TresMesh>
  </TresGroup>
</template>
