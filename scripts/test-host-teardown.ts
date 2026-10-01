const child = Bun.spawn(
  [
    "bunx",
    "playwright",
    "test",
    "--project=chromium",
    "tests/scene-host-teardown.spec.ts",
  ],
  {
    env: { ...process.env, JLZ_HOST_TEARDOWN_TEST: "1" },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  },
);

process.exitCode = await child.exited;
