<script setup lang="ts">
import { markRaw, onMounted, shallowRef } from 'vue'
import {
  Vector3,
  type DirectionalLight,
  type Group,
  type HemisphereLight,
  type PointLight,
} from 'three'
import { CINEMATIC_INTRO_PRESET, type CinematicLightsNodes } from '../../Experience/World/Lights'

type DeclarativeCinematicLights = CinematicLightsNodes

// Initial attribute values bind the controller's intro preset (one source of
// truth — no duplicate authored numbers here; the Lights controller snaps
// the same preset on construction). Only the positions the preset does not
// own (fill/rim/volumetric) stay declared below.
const intro = CINEMATIC_INTRO_PRESET

const emit = defineEmits<{
  ready: [lights: DeclarativeCinematicLights]
}>()

const group = shallowRef<Group | null>(null)
const key = shallowRef<DirectionalLight | null>(null)
const fill = shallowRef<DirectionalLight | null>(null)
const rim = shallowRef<DirectionalLight | null>(null)
const volumetric = shallowRef<PointLight | null>(null)
const hemisphere = shallowRef<HemisphereLight | null>(null)
const keyPosition = markRaw(new Vector3(...intro.keyPos))
const fillPosition = markRaw(new Vector3(-4, 2, 1))
const rimPosition = markRaw(new Vector3(0, 2, -4))
const volumetricPosition = markRaw(new Vector3(0, 1.5, 0))

onMounted(() => {
  if (
    !group.value ||
    !key.value ||
    !fill.value ||
    !rim.value ||
    !volumetric.value ||
    !hemisphere.value
  )
    throw new Error('Declarative cinematic lights did not mount completely.')
  emit('ready', {
    group: group.value,
    key: key.value,
    fill: fill.value,
    rim: rim.value,
    volumetric: volumetric.value,
    hemisphere: hemisphere.value,
  })
})
</script>

<template>
  <TresGroup ref="group" name="cinematic-lights">
    <TresDirectionalLight
      ref="key"
      name="cinematic-key"
      :color="intro.keyColor"
      :intensity="intro.keyIntensity"
      :position="keyPosition"
    />
    <TresDirectionalLight
      ref="fill"
      name="cinematic-fill"
      :color="intro.fillColor"
      :intensity="intro.fillIntensity"
      :position="fillPosition"
    />
    <TresDirectionalLight
      ref="rim"
      name="cinematic-rim"
      :color="intro.rimColor"
      :intensity="intro.rimIntensity"
      :position="rimPosition"
    />
    <TresPointLight
      ref="volumetric"
      name="cinematic-volumetric"
      :color="intro.volumetricColor"
      :intensity="intro.volumetricIntensity"
      :distance="14"
      :position="volumetricPosition"
    />
    <TresHemisphereLight
      ref="hemisphere"
      name="cinematic-hemisphere"
      :sky-color="intro.hemiSky"
      :ground-color="intro.hemiGround"
      :intensity="intro.hemiIntensity"
    />
  </TresGroup>
</template>
