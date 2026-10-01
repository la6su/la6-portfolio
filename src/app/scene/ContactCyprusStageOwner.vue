<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, shallowRef, toRaw } from 'vue'
import type { Group, Object3D } from 'three'
import type { ContactCyprusStage } from '../../Experience/World/ContactCyprusStage'

const props = defineProps<{ stage: ContactCyprusStage }>()
const root = shallowRef<Group | null>(null)
const model = shallowRef<Object3D | null>(null)

onMounted(() => {
  if (!root.value) throw new Error('Declarative Contact Cyprus root did not mount.')
  props.stage.bindRoot(toRaw(root.value), async (nextModel) => {
    model.value = nextModel ? toRaw(nextModel) : null
    await nextTick()
  })
})

onBeforeUnmount(() => {
  if (root.value) props.stage.unbindRoot(toRaw(root.value))
})
</script>

<template>
  <TresGroup ref="root" name="contact-cyprus-stage" :visible="false">
    <!-- The GLTF scene is dynamic content; the stage controller explicitly
         owns and disposes its geometry/materials. -->
    <primitive v-if="model" :object="model" :dispose="null" />
  </TresGroup>
</template>
