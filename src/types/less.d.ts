declare module 'less' {
  interface RenderOptions {
    filename?: string
    javascriptEnabled?: boolean
    rewriteUrls?: 'all' | 'local' | 'off'
  }

  interface RenderOutput {
    css: string
  }

  const less: {
    render(input: string, options?: RenderOptions): Promise<RenderOutput>
  }

  export default less
}
