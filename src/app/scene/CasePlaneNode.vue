<script setup lang="ts">
import { markRaw, onBeforeUnmount, onMounted, shallowRef } from 'vue'
import type { Mesh, PlaneGeometry, Texture } from 'three'
import type { MeshBasicNodeMaterial } from 'three/webgpu'
import {
  acquireCasePlaneGeometry,
  CasePlane,
  createCasePlaneMaterialResources,
} from '../../Experience/World/CasePlane'

const props = defineProps<{ card: { texture: Texture }; ribbon?: boolean }>()
const emit = defineEmits<{ ready: [controller: CasePlane] }>()
const geometryLease = markRaw(acquireCasePlaneGeometry())
const resources = markRaw(
  createCasePlaneMaterialResources(props.card.texture, props.ribbon ?? false),
)
const mesh = shallowRef<Mesh<PlaneGeometry, MeshBasicNodeMaterial> | null>(null)
let controller: CasePlane | null = null

function disposeResources(): void {
  if (controller) {
    controller.dispose(false)
    controller = null
    return
  }
  resources.material.dispose()
  geometryLease.release()
}

onMounted(() => {
  if (!mesh.value) {
    disposeResources()
    throw new Error('Declarative Works case plane did not mount.')
  }
  controller = markRaw(new CasePlane(mesh.value, props.card.texture, resources, geometryLease))
  emit('ready', controller)
})

onBeforeUnmount(disposeResources)
</script>

<template>
  <!-- Vue declares the mesh; the controller adopts its node and drives TSL uniforms. -->
  <TresMesh
    ref="mesh"
    name="works-case-plane"
    :geometry="geometryLease.geometry"
    :material="resources.material"
    :frustum-culled="false"
    :render-order="2"
    :dispose="null"
  />
</template>
