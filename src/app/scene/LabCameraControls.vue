<script setup lang="ts">
// Lazy Cientos camera controls for Lab exploration.
//
// SceneHost loads this wrapper as an async component ONLY while the Lab
// camera-exploration policy is active (lab route + fine pointer + motion
// allowed), which keeps the Cientos/three-stdlib surface out
// of the eager app chunks (the `vendor-lab-controls` chunk rule in
// vite.config.ts routes it into its own lazy file).
//
// Interaction contract:
// rotate-only orbit around the authored content target (origin, where the
// Lab gamepad floats). Wheel zoom and pan are disabled so wheel input remains
// page scroll; only left-button drag rotates the camera. Angle and distance
// limits keep the gamepad framed.
import { OrbitControls } from '@tresjs/cientos'
import { MOUSE } from 'three'
import type { PerspectiveCamera } from 'three'

defineProps<{ camera: PerspectiveCamera }>()

const emit = defineEmits<{ start: [] }>()

const MOUSE_BUTTONS = {
  LEFT: MOUSE.ROTATE,
  MIDDLE: -1,
  RIGHT: -1,
}
const MIN_AZIMUTH = -Math.PI / 3
const MAX_AZIMUTH = Math.PI / 3
const MIN_POLAR = Math.PI / 4
const MAX_POLAR = Math.PI * 0.75
const MIN_DISTANCE = 2.2
const MAX_DISTANCE = 6
</script>

<template>
  <OrbitControls
    :camera="camera"
    make-default
    :mouse-buttons="MOUSE_BUTTONS"
    :enable-zoom="false"
    :enable-pan="false"
    :min-azimuth-angle="MIN_AZIMUTH"
    :max-azimuth-angle="MAX_AZIMUTH"
    :min-polar-angle="MIN_POLAR"
    :max-polar-angle="MAX_POLAR"
    :min-distance="MIN_DISTANCE"
    :max-distance="MAX_DISTANCE"
    @start="emit('start')"
  />
</template>
