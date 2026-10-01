const url = process.argv[2]
const timeoutMs = Number(process.argv[3] ?? 60_000)

if (!url || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  throw new Error('Usage: bun scripts/wait-for-url.ts <url> [timeout-ms]')
}

const deadline = Date.now() + timeoutMs
let lastError = 'no response'

while (Date.now() < deadline) {
  try {
    const response = await fetch(url)
    if (response.ok) process.exit(0)
    lastError = `HTTP ${response.status}`
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error)
  }
  await Bun.sleep(250)
}

throw new Error(`Preview did not become ready at ${url} within ${timeoutMs}ms: ${lastError}`)
