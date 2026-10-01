import { spawnSync } from 'node:child_process'

const result = spawnSync(
  'bunx',
  ['playwright', 'test', '--project=chromium', 'tests/scene-host-teardown.spec.ts'],
  {
    env: { ...process.env, JLZ_HOST_TEARDOWN_TEST: '1' },
    stdio: 'inherit',
  },
)

if (result.error) throw result.error
process.exitCode = result.status ?? 1
