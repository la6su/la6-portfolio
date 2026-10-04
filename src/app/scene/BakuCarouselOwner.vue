<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef } from 'vue'
import type { Group } from 'three'
import type { BakuCarousel, BakuCarouselCardAsset } from '../../Experience/World/BakuCarousel'
import type { CasePlane } from '../../Experience/World/CasePlane'
import { setCarouselCardMetadata } from '../../Experience/World/cardMetadata'
import CasePlaneNode from './CasePlaneNode.vue'

const props = defineProps<{ carousel: BakuCarousel }>()
const root = shallowRef<Group | null>(null)
const cards = shallowRef<readonly BakuCarouselCardAsset[]>([])
let unsubscribe: (() => void) | null = null

function adoptCard(card: BakuCarouselCardAsset, controller: CasePlane): void {
  setCarouselCardMetadata(controller.mesh, {
    textureIndex: Number(card.key.slice(0, card.key.indexOf(':'))),
    textureUrl: card.textureUrl,
    projectIndex: card.projectIndex,
  })
  props.carousel.adoptCard(controller)
}

onMounted(() => {
  if (!root.value) throw new Error('Declarative Baku carousel root did not mount.')
  props.carousel.bindRoot(root.value)
  unsubscribe = props.carousel.subscribeCards((next) => (cards.value = next))
})

onBeforeUnmount(() => {
  unsubscribe?.()
  unsubscribe = null
  if (root.value) props.carousel.unbindRoot(root.value)
})
</script>

<template>
  <TresGroup ref="root" name="baku-carousel" :visible="carousel.visible">
    <TresMesh
      name="works-time-ribbon"
      :geometry="carousel.ribbonGeometry"
      :material="carousel.ribbonMaterial"
      :frustum-culled="false"
      :render-order="1"
      :dispose="null"
    />
    <CasePlaneNode
      v-for="card in cards"
      :key="card.key"
      :card="card"
      ribbon
      @ready="adoptCard(card, $event)"
    />
  </TresGroup>
</template>
