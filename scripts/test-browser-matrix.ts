import { spawnSync } from 'node:child_process'

const result = spawnSync(process.execPath, ['run', 'test:serial'], {
  env: { ...process.env, JLZ_CROSS_BROWSER_MATRIX: '1' },
  stdio: 'inherit',
})

if (result.error) throw result.error
process.exitCode = result.status ?? 1
