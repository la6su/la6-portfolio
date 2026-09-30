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
    /** Read-only runtime evidence seam; written only by entry-app bootstrap. */
    __jlzHost?: JlzHostProbe
  }
}

declare module 'uikit/dist/js/uikit-icons.js' {
  const plugin: (uk: unknown) => void
  export default plugin
}

export {}
