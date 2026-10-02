<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import type { SceneHostReady } from '../Experience/SceneHostContract'
import SceneHost from './SceneHost.vue'
import { eventBus } from '../core/EventBus'
import { devDiagnostic } from '../core/devDiagnostic'

let runtime: import('../Experience/Experience').Experience | null = null
let startup: Promise<void> | null = null
let startupHost: SceneHostReady | null = null
let teardown: Promise<void> | null = null
let disposed = false
let hostGeneration = 0
let unobserveRecovery: (() => void) | null = null
const sceneHostMounted = ref(true)

async function startRuntime(host: SceneHostReady): Promise<void> {
  if (disposed) return
  if (startup && startupHost === host) return startup

  // A replaced SceneHost owns a fresh Tres renderer. Retire the runtime that
  // adopted the old renderer before constructing its successor.
  const generation = ++hostGeneration
  await retireRuntime()
  if (disposed || generation !== hostGeneration) return

  eventBus.emit('jlz:experience-starting')
  startupHost = host
  const currentStartup = (async () => {
    let hostProbe: JlzHostProbe | null = null
    let instance: import('../Experience/Experience').Experience | null = null
    try {
      const { Experience } = await import('../Experience/Experience')
      if (disposed || generation !== hostGeneration) return

      instance = new Experience(host)
      runtime = instance
      hostProbe = {
        mode: host.mode,
        backend: host.backend.backendName,
        isFallbackAdapter: host.backend.isFallbackAdapter,
        recovered: false,
      }
      window.__jlzHost = hostProbe
      unobserveRecovery = eventBus.on('jlz:renderer-recovered', () => {
        if (window.__jlzHost === hostProbe) hostProbe.recovered = true
      })

      await instance.init()
      if (!disposed && generation === hostGeneration) {
        devDiagnostic(
          'info',
          `[ExperienceRuntime] SceneHost ready: mode=${host.mode} backend=${host.backend.backendName ?? '?'} isFallbackAdapter=${host.backend.isFallbackAdapter}`,
        )
        eventBus.emit('jlz:experience-ready')
      }
    } catch (error) {
      await instance?.destroy()
      if (runtime === instance) runtime = null
      if (generation === hostGeneration) {
        unobserveRecovery?.()
        unobserveRecovery = null
        console.error('[ExperienceRuntime] startup failed:', error)
        if (window.__jlzHost === hostProbe) delete window.__jlzHost
        if (!disposed) {
          sceneHostMounted.value = false
          eventBus.emit('jlz:webgl-failed')
        }
      }
    }
  })()
  startup = currentStartup
  await currentStartup
}

/** Finish the active Experience before its SceneHost releases Tres resources. */
function retireRuntime(): Promise<void> {
  if (teardown) return teardown
  const activeRuntime = runtime
  const activeStartup = startup
  const cleanup = (async () => {
    try {
      try {
        await activeRuntime?.destroy()
      } catch (error) {
        console.error('[ExperienceRuntime] runtime cleanup failed:', error)
      }
      await activeStartup?.catch((error: unknown) => {
        console.error('[ExperienceRuntime] pending startup failed during cleanup:', error)
      })
    } finally {
      if (runtime === activeRuntime) runtime = null
      if (startup === activeStartup) {
        startup = null
        startupHost = null
      }
      unobserveRecovery?.()
      unobserveRecovery = null
      delete window.__jlzHost
    }
  })()
  teardown = cleanup
  void cleanup.then(
    () => {
      if (teardown === cleanup) teardown = null
    },
    () => {
      if (teardown === cleanup) teardown = null
    },
  )
  return cleanup
}

function beforeRendererDispose(): Promise<void> {
  hostGeneration++
  return retireRuntime()
}

function reportHostError(error: Error): void {
  if (disposed) return
  console.error('[ExperienceRuntime] SceneHost failed:', error)
  sceneHostMounted.value = false
  eventBus.emit('jlz:webgl-failed')
}

function destroyRuntime(): Promise<void> {
  if (disposed) return teardown ?? Promise.resolve()
  disposed = true
  hostGeneration++
  if (window.__jlzRuntimeDestroy === destroyRuntime) delete window.__jlzRuntimeDestroy
  return retireRuntime()
}

if (import.meta.env.DEV) window.__jlzRuntimeDestroy = destroyRuntime
defineExpose({ destroyRuntime })
onBeforeUnmount(() => {
  void destroyRuntime()
})
</script>

<template>
  <SceneHost
    v-if="sceneHostMounted"
    :before-renderer-dispose="beforeRendererDispose"
    @ready="startRuntime"
    @error="reportHostError"
  />
</template>
