<script setup lang="ts">
import { TresPortal } from "@tresjs/core";
import { onBeforeUnmount, onMounted, shallowRef, watch } from "vue";
import { traceDevLifecycle } from "../../core/devLifecycleTrace";
import type { Mesh } from "three";
import type { ShowreelTheater } from "../../Experience/World/ShowreelTheater";

const props = defineProps<{ theater: ShowreelTheater | null }>();
const quad = shallowRef<Mesh | null>(null);
let boundTheater: ShowreelTheater | null = null;

function syncQuad(): void {
  if (boundTheater && quad.value) boundTheater.unbindQuad(quad.value);
  boundTheater = null;
  if (props.theater && quad.value) {
    props.theater.bindQuad(quad.value);
    boundTheater = props.theater;
    if (import.meta.env.DEV)
      traceDevLifecycle("scene-owner:showreel-quad-bound");
  }
}

onMounted(syncQuad);
watch([() => props.theater, quad], syncQuad, { flush: "post" });
onBeforeUnmount(() => {
  if (boundTheater && quad.value) boundTheater.unbindQuad(quad.value);
  boundTheater = null;
  if (import.meta.env.DEV)
    traceDevLifecycle("scene-owner:showreel-quad-unbound");
});
</script>

<template>
  <TresPortal v-if="theater" :to="theater.scene">
    <TresMesh
      ref="quad"
      name="showreel-theater-quad"
      :material="theater.quadMaterial"
    >
      <TresPlaneGeometry :args="[2, 2]" />
    </TresMesh>
  </TresPortal>
</template>
