import { defineConfig } from '@playwright/test'

// A physical WebGL recovery gate: use the installed Chrome with WebGPU
// disabled so the production automatic policy constructs WebGPURenderer on
// WebGLBackend. CI and the regular suite retain Playwright Chromium defaults.
const webglRecoveryChrome = process.env.JLZ_WEBGL_RECOVERY_CHROME === '1'
const webglRecoveryOzone = process.env.JLZ_WEBGL_OZONE ?? 'wayland'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: webglRecoveryChrome
      ? 'bunx vite --host 127.0.0.1 --port 4173'
      : 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173',
    port: 4173,
    reuseExistingServer: !process.env.CI && !webglRecoveryChrome,
  },
  projects: [
    {
      name: 'chromium',
      use: webglRecoveryChrome
        ? {
            browserName: 'chromium',
            channel: 'chrome',
            headless: false,
            launchOptions: {
              args: [
                '--disable-features=WebGPU',
                '--enable-features=UseOzonePlatform',
                `--ozone-platform=${webglRecoveryOzone}`,
              ],
            },
          }
        : { browserName: 'chromium' },
    },
  ],
})
