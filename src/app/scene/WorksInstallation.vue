<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import * as THREE from 'three'
import {
  WorksInstallation,
  type WorksInstallationNodes,
} from '../../Experience/World/WorksInstallation'

const props = defineProps<{ installation: WorksInstallation }>()
const assembly = shallowRef<THREE.Group | null>(null)
const arcs = shallowRef<THREE.Mesh[]>([])
const trace = shallowRef<THREE.Mesh | null>(null)
const ticks = shallowRef<THREE.InstancedMesh | null>(null)

const arcArgs: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [1, 0.045, 10, 100, Math.PI * 1.65],
  [1.15, 0.037, 10, 100, Math.PI * 1.65],
  [1.3, 0.029, 10, 100, Math.PI * 1.65],
]
const arcRotations: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 0],
  [0.42, -0.3, 1.8],
  [0.84, -0.6, 3.6],
]
const instance = new THREE.Object3D()
let mountedNodes: WorksInstallationNodes | null = null

function nodes(): WorksInstallationNodes | null {
  if (!assembly.value || arcs.value.length !== 3 || !trace.value || !ticks.value) return null
  return { assembly: assembly.value, arcs: arcs.value, trace: trace.value, ticks: ticks.value }
}

function disposeGeometry(): void {
  const mounted = mountedNodes
  if (!mounted) return
  props.installation.release(mounted)
  mounted.arcs.forEach((arc) => arc.geometry.dispose())
  mounted.trace.geometry.dispose()
  mounted.ticks.geometry.dispose()
  mounted.ticks.dispose()
  mountedNodes = null
}

onMounted(() => {
  const mounted = nodes()
  if (!mounted) throw new Error('Declarative Works installation did not mount completely.')
  mountedNodes = mounted
  for (let index = 0; index < 48; index += 1) {
    const angle = (index / 48) * Math.PI * 1.6
    instance.position.set(Math.sin(angle) * 1.42, Math.cos(angle) * 1.42, -0.12)
    instance.rotation.z = -angle
    instance.updateMatrix()
    mounted.ticks.setMatrixAt(index, instance.matrix)
  }
  mounted.ticks.instanceMatrix.needsUpdate = true
  props.installation.adopt(mounted)
})

watch(() => props.installation, (owner, previous) => {
  if (!mountedNodes) return
  previous.release(mountedNodes)
  owner.adopt(mountedNodes)
})

onBeforeUnmount(disposeGeometry)
</script>

<template>
  <TresGroup ref="assembly" name="works-installation-assembly">
    <TresMesh
      v-for="(args, index) in arcArgs"
      :key="index"
      ref="arcs"
      :material="props.installation.metalMaterial"
      :rotation="arcRotations[index]"
      :dispose="null"
    >
      <TresTorusGeometry :args="args" />
    </TresMesh>
    <TresMesh
      ref="trace"
      :material="props.installation.signalMaterial"
      :position="[0, 0, 0.055]"
      :dispose="null"
    >
      <TresTorusGeometry :args="[1.03, 0.006, 5, 100, Math.PI * 1.45]" />
    </TresMesh>
    <TresInstancedMesh
      ref="ticks"
      :args="[undefined, undefined, 48]"
      :material="props.installation.signalMaterial"
      :dispose="null"
    >
      <TresBoxGeometry :args="[0.006, 0.055, 0.008]" />
    </TresInstancedMesh>
  </TresGroup>
</template>
