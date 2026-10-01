import { spawnSync } from 'node:child_process'

const result = spawnSync('bunx', ['playwright', 'test', '--workers=1', '--reporter=line'], {
  env: { ...process.env, JLZ_CROSS_BROWSER_MATRIX: '1' },
  stdio: 'inherit',
})

if (result.error) throw result.error
process.exitCode = result.status ?? 1
