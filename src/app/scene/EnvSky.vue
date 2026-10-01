<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef } from 'vue'
import { Vector3 } from 'three'
import type { Mesh, MeshBasicMaterial, PlaneGeometry } from 'three'
import { traceDevLifecycle } from '../../core/devLifecycleTrace'

const props = defineProps<{ material: MeshBasicMaterial }>()
const emit = defineEmits<{ ready: [mesh: Mesh<PlaneGeometry, MeshBasicMaterial>] }>()
const mesh = shallowRef<Mesh<PlaneGeometry, MeshBasicMaterial> | null>(null)
const position = new Vector3(0, 0, -44)

onMounted(() => {
  if (!mesh.value)
    throw new Error('Declarative environment sky did not mount.')
  emit('ready', mesh.value)
})

onBeforeUnmount(() => {
  // The material is borrowed from EnvSphereOwner. Keep disposal at that
  // owner's boundary and release only the geometry created by this component.
  mesh.value?.geometry.dispose()
  if (import.meta.env.DEV) traceDevLifecycle('scene-owner:env-sky-disposed')
})
</script>

<template>
  <TresMesh
    ref="mesh"
    name="pavilion-sky"
    :material="props.material"
    :position="position"
    :render-order="-1001"
    :frustum-culled="false"
    :dispose="null"
  >
    <TresPlaneGeometry :args="[140, 96]" />
  </TresMesh>
</template>
