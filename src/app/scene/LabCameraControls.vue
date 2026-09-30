<script setup lang="ts">
// src/app/scene/LabCameraControls.vue — ADR 0005's first Cientos adoption.
//
// SceneHost loads this wrapper as an async component ONLY while the Lab
// camera-exploration policy is active (lab route + fine pointer + motion
// allowed), which keeps the whole Cientos/camera-controls/stdlib surface out
// of the eager app chunks (the `vendor-lab-controls` chunk rule in
// vite.config.ts routes it into its own lazy file).
//
// Product contract (decided with the ADR 0005 pointer-events queue item):
// rotate-only orbit around the authored content target (origin, where the
// Lab gamepad floats). The wheel stays page scroll — the Cientos default
// maps it to DOLLY, which would hijack scrolling wherever the Lab section
// pass-through exposes the canvas — and middle/right buttons stay untouched
// page behavior. Azimuth/polar/distance limits keep the gamepad framed.
import { CameraControls } from '@tresjs/cientos'
import CameraControlsClass from 'camera-controls'
import type { PerspectiveCamera } from 'three'

defineProps<{ camera: PerspectiveCamera }>()

const emit = defineEmits<{ start: [] }>()

const MOUSE_BUTTONS = {
  left: CameraControlsClass.ACTION.ROTATE,
  middle: CameraControlsClass.ACTION.NONE,
  right: CameraControlsClass.ACTION.NONE,
  wheel: CameraControlsClass.ACTION.NONE,
}
const MIN_AZIMUTH = -Math.PI / 3
const MAX_AZIMUTH = Math.PI / 3
const MIN_POLAR = Math.PI / 4
const MAX_POLAR = Math.PI * 0.75
const MIN_DISTANCE = 2.2
const MAX_DISTANCE = 6
</script>

<template>
  <CameraControls
    :camera="camera"
    make-default
    :mouse-buttons="MOUSE_BUTTONS"
    :min-azimuth-angle="MIN_AZIMUTH"
    :max-azimuth-angle="MAX_AZIMUTH"
    :min-polar-angle="MIN_POLAR"
    :max-polar-angle="MAX_POLAR"
    :min-distance="MIN_DISTANCE"
    :max-distance="MAX_DISTANCE"
    @start="emit('start')"
  />
</template>
