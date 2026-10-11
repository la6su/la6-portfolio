<script setup lang="ts">
// Declarative composition of the pointer-ink plane. Tres constructs the plane
// geometry and the TSL node material and disposes both when this route owner
// unmounts; the stage keeps only the frame semantics (uniform values, damping,
// reveal, theme) and borrows the mounted mesh to feed its node graph.
import { onBeforeUnmount, onMounted, shallowRef, toRaw } from 'vue'
import { DoubleSide } from 'three'
import type { Mesh } from 'three'
import { traceDevLifecycle } from '../../core/devLifecycleTrace'
import type { PointerInkStage } from '../../Experience/World/PointerInkStage'

const props = defineProps<{ stage: PointerInkStage }>()
const inkMesh = shallowRef<Mesh | null>(null)

onMounted(() => {
  if (!inkMesh.value) {
    throw new Error('Declarative pointer ink mesh did not mount.')
  }
  props.stage.bindMesh(toRaw(inkMesh.value))
  if (import.meta.env.DEV) traceDevLifecycle('scene-owner:pointer-ink-bound')
})

onBeforeUnmount(() => {
  if (inkMesh.value) props.stage.unbindMesh(toRaw(inkMesh.value))
  if (import.meta.env.DEV) traceDevLifecycle('scene-owner:pointer-ink-unbound')
})
</script>

<template>
  <TresGroup :name="stage.stageName" :visible="stage.visible">
    <TresMesh
      ref="inkMesh"
      :name="stage.meshName"
      :position="stage.meshPosition"
      :scale="[0.001, 0.001, 0.001]"
      :frustum-culled="false"
      :render-order="1"
    >
      <TresPlaneGeometry :args="stage.planeSize" />
      <TresMeshBasicNodeMaterial
        :transparent="true"
        :depth-write="false"
        :side="DoubleSide"
        :fog="false"
        :tone-mapped="false"
      />
    </TresMesh>
  </TresGroup>
</template>
