<script setup lang="ts">
import { markRaw, onMounted, shallowRef } from 'vue'
import type { Group, Mesh } from 'three'
import {
  buildBakuShellGeometry,
  createBakuShellMaterial,
  type BakuCubeNodes,
} from '../../Experience/World/SplashCube'

const emit = defineEmits<{ ready: [nodes: BakuCubeNodes] }>()
const root = shallowRef<Group | null>(null)
const shell = shallowRef<Mesh | null>(null)
// The authored geometry recipe + glass params live in the controller module
// (one source of truth — no duplicate authored numbers here).
const shellGeometry = markRaw(buildBakuShellGeometry())
const shellMaterial = markRaw(createBakuShellMaterial())

onMounted(() => {
  if (!root.value || !shell.value) {
    throw new Error('Declarative baku cube did not mount completely.')
  }
  emit('ready', { root: root.value, shell: shell.value })
})
</script>

<template>
  <TresGroup ref="root" name="baku">
    <TresMesh
      ref="shell"
      name="baku-shell"
      :geometry="shellGeometry"
      :material="shellMaterial"
      :render-order="2"
    />
  </TresGroup>
</template>
