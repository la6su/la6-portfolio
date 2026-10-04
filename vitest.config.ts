import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { templateCompilerOptions } from '@tresjs/core'
import { resolve } from 'node:path'

const root = import.meta.dirname

export default defineConfig({
  plugins: [vue(templateCompilerOptions)],
  // Mirror the production aliases (vite.config.ts) so the unit suite resolves
  // the same three/three-stdlib module graph the app ships with, instead of
  // silently exercising the classic three entry.
  resolve: {
    alias: [
      { find: /^three$/, replacement: resolve(root, 'src/three-webgpu-compat.ts') },
      { find: /^three-stdlib$/, replacement: resolve(root, 'src/three-stdlib-compat.ts') },
    ],
  },
  test: {
    environment: 'jsdom',
    // Browser tests must use jsdom storage, not Node's file-backed Web Storage.
    execArgv: ['--no-experimental-webstorage'],
    include: ['tests/unit/**/*.test.ts'],
  },
})
