<script setup lang="ts">
import { onMounted, shallowRef } from 'vue'
import type { Group, Mesh } from 'three'
import {
  BAKU_SHELL_ARGS,
  BAKU_SHELL_MATERIAL,
  type BakuCubeNodes,
} from '../../Experience/World/SplashCube'

const emit = defineEmits<{ ready: [nodes: BakuCubeNodes] }>()
const root = shallowRef<Group | null>(null)
const shell = shallowRef<Mesh | null>(null)
// The authored geometry args + glass params stay in the controller module (one
// source of truth — no duplicate authored numbers here); the template binds them.

onMounted(() => {
  if (!root.value || !shell.value) {
    throw new Error('Declarative baku cube did not mount completely.')
  }
  emit('ready', { root: root.value, shell: shell.value })
})
</script>

<template>
  <!-- Tres owns the shell geometry and material. SplashCube rounds the declared
       box container in place and deforms it; unmount releases both resources. -->
  <TresGroup ref="root" name="baku">
    <TresMesh ref="shell" name="baku-shell" :render-order="2">
      <TresBoxGeometry :args="BAKU_SHELL_ARGS" />
      <TresMeshPhysicalMaterial v-bind="BAKU_SHELL_MATERIAL" />
    </TresMesh>
  </TresGroup>
</template>
