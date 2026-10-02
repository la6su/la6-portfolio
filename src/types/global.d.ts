// src/types/global.d.ts
declare global {
  interface JlzHostProbe {
    readonly mode: 'webgpu' | 'webgl'
    readonly backend: string | null
    readonly isFallbackAdapter: boolean | null
    recovered: boolean
  }

  interface Window {
    UIkit: any
    /** Read-only runtime evidence seam; written by the Vue runtime owner. */
    __jlzHost?: JlzHostProbe
    /** Development-only hooks used to observe real SceneHost teardown. */
    __jlzTestLifecycleTrace?: string[]
    __jlzTestUnmountVueApp?: () => Promise<void>
    __jlzEmit?: (event: string, detail?: unknown) => void
    __jlzRuntimeDestroy?: () => Promise<void>
  }
}

declare module 'uikit/dist/js/uikit-icons.js' {
  const plugin: (uk: unknown) => void
  export default plugin
}

export {}
