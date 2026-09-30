#!/usr/bin/env bun
/** Local Markdown reference check (the NEXT.md "cheap docs check").
 *
 *  Validates every local file link in tracked Markdown: the target must
 *  exist inside the repository and a `#heading` fragment must match a
 *  heading in the target file (GitHub slug rules). External URLs and
 *  mailto are skipped; historical evidence payloads under docs/evidence/
 *  (everything except its README) are never rewritten, so they are
 *  excluded as link sources. Plain Bun tooling, no new framework.
 *
 *  Usage: bun scripts/check-docs.ts   (exit 1 on any broken reference)
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')

/** GitHub-style heading slug: lowercase, punctuation stripped (letters,
 *  numbers, spaces, hyphens and underscores kept), spaces → hyphens. */
function githubSlug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s\-_]/gu, '')
    .replace(/\s/g, '-')
}

/** Lines outside fenced code blocks, with their 1-based numbers. */
function* outsideFences(text: string): Generator<{ line: string; number: number }> {
  let fenced = false
  let number = 0
  for (const line of text.split('\n')) {
    number += 1
    if (/^\s{0,3}(```|~~~)/.test(line)) {
      fenced = !fenced
      continue
    }
    if (!fenced) yield { line, number }
  }
}

/** Heading slugs of a Markdown document (fenced blocks excluded). */
function headingSlugs(text: string): Set<string> {
  const slugs = new Set<string>()
  for (const { line } of outsideFences(text)) {
    const match = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)
    if (match) slugs.add(githubSlug(match[1] as string))
  }
  return slugs
}

interface LocalLink {
  target: string
  column: number
}

/** Inline `[text](target)` links of one line (images included), inline
 *  code spans excluded so fenced/snippet references never false-positive. */
function localLinks(line: string): LocalLink[] {
  const withoutCode = line.replace(/`[^`]*`/g, (span) => ' '.repeat(span.length))
  const links: LocalLink[] = []
  const pattern = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
  for (let match = pattern.exec(withoutCode); match; match = pattern.exec(withoutCode)) {
    const target = match[1] as string
    // Evidence protocol: external URLs and mailto stay out of scope.
    if (/^(https?:|mailto:|\/\/)/i.test(target)) continue
    links.push({ target, column: (match.index ?? 0) + 1 })
  }
  return links
}

const tracked = execFileSync('git', ['ls-files', '*.md'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  // Historical evidence payloads are dated observations; only the
  // protocol README under docs/evidence/ is an active document.
  .filter((file) => file === 'docs/evidence/README.md' || !file.startsWith('docs/evidence/'))

const broken: { at: string; target: string; reason: string }[] = []
let checkedLinks = 0

for (const file of tracked) {
  const text = readFileSync(join(root, file), 'utf8')
  const ownSlugs = headingSlugs(text)
  for (const { line, number } of outsideFences(text)) {
    for (const { target, column } of localLinks(line)) {
      checkedLinks += 1
      const [pathPart, fragment] = target.split('#')
      const at = `${file}:${number}:${column}`
      const targetFile =
        pathPart === '' ? file : relative(root, resolve(root, dirname(file), pathPart as string))
      if (targetFile.startsWith('..') || isAbsolute(targetFile)) {
        broken.push({ at, target, reason: 'escapes the repository' })
        continue
      }
      const targetPath = join(root, targetFile)
      if (!existsSync(targetPath)) {
        broken.push({ at, target, reason: 'target not found' })
        continue
      }
      if (fragment) {
        const slugs = pathPart === '' ? ownSlugs : headingSlugs(readFileSync(targetPath, 'utf8'))
        if (!slugs.has(githubSlug(fragment))) {
          broken.push({ at, target, reason: `fragment "#${fragment}" not found in ${targetFile}` })
        }
      }
    }
  }
}

for (const { at, target, reason } of broken) console.error(`${at}: ${target} — ${reason}`)
console.log(`checked ${tracked.length} files, ${checkedLinks} local links`)
console.log(broken.length === 0 ? 'docs: OK' : `docs: ${broken.length} broken reference(s)`)
if (broken.length > 0) process.exitCode = 1
