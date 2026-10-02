import { defineConfig } from '@playwright/test'

// Opt-in WebGL recovery gates use production preview; host teardown alone
// needs the dev server for its runtime destruction probe.
const webglRecoveryChrome = process.env.JLZ_WEBGL_RECOVERY_CHROME === '1'
const webglRecoveryFirefox = process.env.JLZ_WEBGL_RECOVERY_FIREFOX === '1'
const webglRecoveryOzone = process.env.JLZ_WEBGL_OZONE ?? 'wayland'
const webglRecoverySoftware = process.env.JLZ_WEBGL_RECOVERY_SOFTWARE === '1'
const rendererInitFailure = process.env.JLZ_RENDERER_INIT_FAILURE_CHROME === '1'
const hostTeardownTest = process.env.JLZ_HOST_TEARDOWN_TEST === '1'
const localChromiumPath = process.env.JLZ_CHROMIUM_PATH
const crossBrowserMatrix = Boolean(process.env.CI) || process.env.JLZ_CROSS_BROWSER_MATRIX === '1'

const chromiumProject = {
  name: 'chromium',
  use: webglRecoveryChrome
    ? {
        browserName: 'chromium' as const,
        ...(localChromiumPath ? {} : { channel: 'chrome' as const }),
        headless: false,
        launchOptions: {
          ...(localChromiumPath ? { executablePath: localChromiumPath } : {}),
          args: [
            '--disable-features=WebGPU',
            '--enable-features=UseOzonePlatform',
            `--ozone-platform=${webglRecoveryOzone}`,
            ...(webglRecoverySoftware
              ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-gpu-sandbox']
              : []),
          ],
        },
      }
    : {
        browserName: 'chromium' as const,
        ...(localChromiumPath
          ? {
              launchOptions: {
                executablePath: localChromiumPath,
                args: [
                  '--no-sandbox',
                  '--enable-unsafe-webgpu',
                  '--enable-unsafe-swiftshader',
                  '--use-angle=swiftshader',
                  '--disable-gpu-sandbox',
                  ...(rendererInitFailure ? ['--disable-webgpu', '--disable-webgl'] : []),
                ],
              },
            }
          : rendererInitFailure
            ? {
                launchOptions: {
                  args: ['--disable-webgpu', '--disable-webgl'],
                },
              }
            : {}),
      },
}

const projects = crossBrowserMatrix
  ? [
      chromiumProject,
      { name: 'firefox', use: { browserName: 'firefox' as const } },
      { name: 'webkit', use: { browserName: 'webkit' as const } },
    ]
  : [chromiumProject]

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
    command: hostTeardownTest
      ? 'bun run dev --host 127.0.0.1 --port 4173'
      : 'bun run build && bun run preview --host 127.0.0.1 --port 4173',
    port: 4173,
    reuseExistingServer:
      !process.env.CI && !webglRecoveryChrome && !webglRecoveryFirefox && !hostTeardownTest,
  },
  projects,
})
