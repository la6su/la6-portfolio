<script setup lang="ts">
import { markRaw, onBeforeUnmount, onMounted, shallowRef, toRaw } from 'vue'
import type { Group } from 'three'
import { ServicesStage } from '../../Experience/World/ServicesStage'

const emit = defineEmits<{ ready: [stage: ServicesStage] }>()
const stage = markRaw(new ServicesStage())
const root = shallowRef<Group | null>(null)
const sculpture = shallowRef<Group | null>(null)

onMounted(() => {
  if (!root.value || !sculpture.value) {
    throw new Error('Declarative services stage did not mount completely.')
  }
  stage.adopt({
    root: toRaw(root.value),
    sculpture: toRaw(sculpture.value),
  })
  emit('ready', stage)
})

onBeforeUnmount(() => {
  stage.dispose()
})
</script>

<template>
  <TresGroup ref="root" name="services-signal-sculpture" :dispose="null">
    <TresGroup ref="sculpture" name="services-folded-ribbon">
      <TresMesh
        :geometry="stage.ribbonGeometry"
        :material="stage.sculptureMaterial"
        name="services-metal-ribbon"
      />
      <TresMesh
        :geometry="stage.seamGeometry"
        :material="stage.seamSignalMaterial"
        name="services-phosphor-seam"
      />
    </TresGroup>
  </TresGroup>
</template>
