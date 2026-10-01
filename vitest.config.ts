import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { templateCompilerOptions } from '@tresjs/core'

export default defineConfig({
  plugins: [vue(templateCompilerOptions)],
  test: {
    environment: 'jsdom',
    // Browser tests must use jsdom storage, not Node's file-backed Web Storage.
    execArgv: ['--no-experimental-webstorage'],
    include: ['src/**/*.test.ts'],
  },
})
