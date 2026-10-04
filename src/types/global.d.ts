// src/types/global.d.ts
declare global {
  interface JlzHostProbe {
    readonly mode: 'webgpu' | 'webgl'
    readonly backend: string | null
    readonly isFallbackAdapter: boolean | null
    recovered: boolean
  }

  interface Window {
    UIkit: typeof import('../core/uikit').default
    /** Read-only runtime evidence seam; written by the Vue runtime owner. */
    __jlzHost?: JlzHostProbe
    /** Set after the initial route has mounted; removed with the Vue app. */
    __jlzRouterReady?: boolean
    /** Development-only hooks used to observe real SceneHost teardown. */
    __jlzTestLifecycleTrace?: string[]
    __jlzTestUnmountVueApp?: () => Promise<void>
    __jlzEmit?: (event: string, detail?: unknown) => void
    __jlzRuntimeDestroy?: () => Promise<void>
    /**
     * Development-only teardown fault injectors: owner name → disposer
     * stand-in that throws (sync owners) or rejects (async-captured owners).
     */
    __jlzTestTeardownFaults?: Record<string, () => unknown>
  }
}

declare module 'uikit/dist/js/uikit-icons.js' {
  const plugin: (uk: unknown) => void
  export default plugin
}

export {}
