<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import type { Group } from 'three'
import type { WorksInstallation } from '../../Experience/World/WorksInstallation'
import type { WorksCaseCard, WorksPlaneStage } from '../../Experience/World/WorksPlaneStage'
import CasePlaneNode from './CasePlaneNode.vue'
import WorksInstallationNode from './WorksInstallation.vue'

const props = defineProps<{
  stage: WorksPlaneStage | null
  installation: WorksInstallation | null
}>()
const cards = shallowRef<readonly WorksCaseCard[]>([])
let unsubscribeCards: (() => void) | null = null
const emit = defineEmits<{ 'root-ready': [root: Group] }>()
const root = shallowRef<Group | null>(null)

onMounted(() => {
  if (!root.value) throw new Error('Declarative Works stage root did not mount.')
  emit('root-ready', root.value)
})

watch(
  () => props.stage,
  (stage) => {
    unsubscribeCards?.()
    unsubscribeCards = null
    cards.value = []
    if (stage) unsubscribeCards = stage.subscribeSceneCards((nextCards) => (cards.value = nextCards))
  },
  { immediate: true },
)

onBeforeUnmount(() => unsubscribeCards?.())
</script>

<template>
  <!-- Vue owns the stable root; the route controller owns dynamic case leaves. -->
  <TresGroup ref="root" name="works-plane-stage" :visible="false" :dispose="null">
    <CasePlaneNode
      v-for="card in cards"
      :key="card.key"
      :card="card"
      @ready="stage?.adoptCard(card.projectIndex, $event)"
    />
    <WorksInstallationNode v-if="props.installation" :installation="props.installation" />
  </TresGroup>
</template>
