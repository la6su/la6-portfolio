<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, toRaw } from 'vue'
import type { Group } from 'three'
import { LAB_GAMEPAD_POSE } from '../../Experience/World/LabGamepad'
import type { LabExperimentObject } from '../../Experience/Lab/manifest'

const props = defineProps<{ stage: LabExperimentObject }>()
const root = shallowRef<Group | null>(null)
const crankPivot = shallowRef<Group | null>(null)
const screwPositions = [
  [-54, -35, 7.4],
  [54, -35, 7.4],
  [-54, 35, 7.4],
  [54, 35, 7.4],
] as const

onMounted(() => {
  if (!root.value || !crankPivot.value) throw new Error('Declarative Lab gamepad did not mount.')
  props.stage.bindNodes(toRaw(root.value), toRaw(crankPivot.value))
})

onBeforeUnmount(() => {
  if (root.value) props.stage.unbindNodes(toRaw(root.value))
})
</script>

<template>
  <TresGroup
    ref="root"
    name="lab-gamepad"
    :visible="stage.visible"
    :position="LAB_GAMEPAD_POSE.position"
    :rotation="LAB_GAMEPAD_POSE.rotation"
    :scale="LAB_GAMEPAD_POSE.scale"
    :dispose="null"
  >
    <TresMesh
      name="gamepad-body"
      :geometry="stage.resources.geometry.body"
      :material="stage.resources.material.shell"
      cast-shadow
      receive-shadow
      :dispose="null"
    />
    <TresMesh
      name="screen-frame"
      :geometry="stage.resources.geometry.screenFrame"
      :material="stage.resources.material.dark"
      :position="[0, 11, 7.2]"
      cast-shadow
      :dispose="null"
    />
    <TresMesh
      name="screen"
      :geometry="stage.resources.geometry.screen"
      :material="stage.resources.material.metal"
      :position="[0, 11, 9.15]"
      cast-shadow
      :dispose="null"
    />
    <TresMesh
      name="gamepad-dpad"
      :geometry="stage.resources.geometry.dpad"
      :material="stage.resources.material.accent"
      :position="[-35, -25, 8.5]"
      cast-shadow
      :dispose="null"
    />
    <TresMesh
      name="button-a"
      :geometry="stage.resources.geometry.button"
      :material="stage.resources.material.accent"
      :position="[25, -25, 8.5]"
      cast-shadow
      :dispose="null"
    />
    <TresMesh
      name="button-b"
      :geometry="stage.resources.geometry.button"
      :material="stage.resources.material.accent"
      :position="[45, -25, 8.5]"
      cast-shadow
      :dispose="null"
    />
    <TresMesh
      v-for="position in screwPositions"
      :key="position.join(',')"
      name="gamepad-screw"
      :geometry="stage.resources.geometry.screw"
      :material="stage.resources.material.metal"
      :position="position"
      cast-shadow
      :dispose="null"
    />
    <TresGroup ref="crankPivot" name="gamepad-crank" :position="LAB_GAMEPAD_POSE.crankPosition">
      <TresMesh
        name="crank-arm"
        :geometry="stage.resources.geometry.crankArm"
        :material="stage.resources.material.metal"
        cast-shadow
        :dispose="null"
      />
      <TresMesh
        name="gamepad-crank-knob"
        :geometry="stage.resources.geometry.crankKnob"
        :material="stage.resources.material.accent"
        :position="[0, 17, 0]"
        cast-shadow
        :dispose="null"
      />
    </TresGroup>
  </TresGroup>
</template>
