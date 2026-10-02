<script setup lang="ts">
import { onBeforeUnmount } from 'vue'
import type { SceneHostReady } from '../Experience/SceneHostContract'
import SceneHost from './SceneHost.vue'
import { eventBus } from '../core/EventBus'
import { devDiagnostic } from '../core/devDiagnostic'

let runtime: import('../Experience/Experience').Experience | null = null
let startup: Promise<void> | null = null
let teardown: Promise<void> | null = null
let disposed = false
let unobserveRecovery: (() => void) | null = null

async function startRuntime(host: SceneHostReady): Promise<void> {
  if (startup || disposed) return
  eventBus.emit('jlz:experience-starting')
  startup = (async () => {
    let hostProbe: JlzHostProbe | null = null
    try {
      const { Experience } = await import('../Experience/Experience')
      if (disposed) return

      const instance = new Experience({ ...host, sizes: host.context.sizes })
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
      if (!disposed) {
        devDiagnostic(
          'info',
          `[ExperienceRuntime] SceneHost ready: mode=${host.mode} backend=${host.backend.backendName ?? '?'} isFallbackAdapter=${host.backend.isFallbackAdapter}`,
        )
        eventBus.emit('jlz:experience-ready')
      }
    } catch (error) {
      await runtime?.destroy()
      runtime = null
      unobserveRecovery?.()
      unobserveRecovery = null
      if (!disposed) {
        console.error('[ExperienceRuntime] startup failed:', error)
        if (window.__jlzHost === hostProbe) delete window.__jlzHost
        eventBus.emit('jlz:webgl-failed')
      }
    }
  })()
  await startup
}

function reportHostError(error: Error): void {
  if (disposed) return
  console.error('[ExperienceRuntime] SceneHost failed:', error)
  eventBus.emit('jlz:webgl-failed')
}

function destroyRuntime(): Promise<void> {
  if (teardown) return teardown
  disposed = true
  if (window.__jlzRuntimeDestroy === destroyRuntime) delete window.__jlzRuntimeDestroy
  unobserveRecovery?.()
  unobserveRecovery = null
  delete window.__jlzHost
  teardown = (async () => {
    await runtime?.destroy()
    await startup?.catch(() => undefined)
    runtime = null
  })()
  return teardown
}

if (import.meta.env.DEV) window.__jlzRuntimeDestroy = destroyRuntime
defineExpose({ destroyRuntime })
onBeforeUnmount(() => {
  void destroyRuntime()
})
</script>

<template>
  <SceneHost @ready="startRuntime" @error="reportHostError" />
</template>
