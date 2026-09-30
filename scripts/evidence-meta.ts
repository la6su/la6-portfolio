#!/usr/bin/env bun
/** Evidence-protocol metadata shared by the report producers.
 *
 *  docs/evidence/README.md requires every new evidence report to identify
 *  UTC time, revision/dirty state, command, browser, device, backend,
 *  viewport/DPR, failures and skips. UTC, host, backend and viewport are
 *  producer-specific; this helper owns the revision/dirty state, command
 *  and browser identity so the live gate and the route-cycle soak record
 *  them identically (same convention as scripts/bundle-breakdown.ts).
 */
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

export interface EvidenceMeta {
  /** Full HEAD commit hash the report was produced at. */
  commit: string
  /** `git status --porcelain` lines; empty = clean checkout. */
  dirtyFiles: string[]
  /** The exact command that produced the report. */
  command: string
  /** Browser identity (type/channel + version) used for the run. */
  browser: string
}

export function evidenceMeta(command: string, browser: string): EvidenceMeta {
  const root = resolve(import.meta.dir, '..')
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim()
  const dirtyFiles = execFileSync('git', ['status', '--porcelain'], {
    cwd: root,
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter(Boolean)
  return { commit, dirtyFiles, command, browser }
}
