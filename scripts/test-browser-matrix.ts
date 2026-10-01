const child = Bun.spawn(
  ["bunx", "playwright", "test", "--workers=1", "--reporter=line"],
  {
    env: { ...process.env, JLZ_CROSS_BROWSER_MATRIX: "1" },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  },
);

process.exitCode = await child.exited;
