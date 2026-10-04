# Completeness audit — TvT v5 on WebGPU

Owner-requested, read-only audit answering one question: is the TvT v5
(Tres/Cientos declarative paradigm) refactor on the Three.js WebGPU
renderer truly complete? Three parallel audit lanes ran — renderer stack,
paradigm compliance, cross-cutting consistency — and every finding below
was re-verified in the main session before being recorded here. The audit
itself changed no source file; the live work queue remains
[NEXT.md](NEXT.md).

- Date: 2026-10-04 · Branch: `refactor/tvt-v5-audit` @ `dbfcaed6` (clean tree)
- Checks that ran: static reads/greps across `src/`, `tests/`, `scripts/`,
  `blog/`, `content/`, configs; module-graph probes of installed
  `three` 0.186.1, `@tresjs/core` 5.9.2, `@tresjs/cientos` 5.9.2,
  `three-stdlib` 2.36.1, `@types/three` 0.186.0; git forensics on tracked
  `dist/`; a collection-only `playwright test --list` probe. No builds, no
  test suites, and no browser sessions were run by this audit; prior
  runtime evidence stands as recorded in NEXT.md.

## Verdict

**The source tree is architecture-complete; the branch is not
release-clean, so "fully complete" is not yet an honest claim.**

- The WebGPU/Tres renderer path has no correctness gap: single renderer
  construction, exact backend-selection and fallback semantics, verified
  shims, race-free async init, bounded device-loss recovery, and a fully
  traced TSL post pipeline (section D).
- The declarative migration matches the goal definition: 22/22 scene
  owners are Vue/Tres-declared, imperative code is confined to sanctioned
  categories, Cientos is bounded to OrbitControls with the constraint
  re-verified, and no recorded keep-verdict is overturned (section D).
- Two MAJOR release-state defects exist at HEAD (section A): the tracked
  `dist/` predates two source commits (acceptance criterion 6 is false),
  and bare `playwright test` fails at collection. Both are mechanical
  fixes, neither touches the refactor architecture.
- Eight minor leftovers/hardening items (sections B and C), plus the three
  previously recorded hardware/deployment gates (section E).

## A. Release-blocking findings

### A1 — MAJOR: tracked `dist/` is stale; criterion 6 is false at HEAD

- Evidence: `git log -1 -- dist` → `e9d81072`; `bad05920` (form-CSS
  removal) touched only `src/assets/**` and `e4c4e325` (teardown-fault
  seam) touched only `src/` + `tests/` — neither regenerated `dist/`.
  `dist/assets/main-7wmbxXWj.js` is 225,185 B and
  `dist/assets/blog-UaLzzAMX.css` is 159,495 B — exactly the pre-slice
  sizes (post-slice esbuild measures: ≈205,150 / ≈139,209), and the blog
  CSS still contains 55 `uk-form` occurrences plus the full
  `uk-input`/`uk-radio`/`uk-select`/`uk-checkbox`/`uk-textarea` families
  that `_import.less` no longer imports.
- Impact: CI (`quality.yml` "Build, unit, and lint" job, lines 25–28) runs
  `bun run build` then `git diff --exit-code -- dist blog.html blog/
ru/blog.html ru/blog/ prerender/home.html public/robots.txt
public/sitemap.xml` — this diff is non-empty today, so the gate fails;
  "tracked release artifacts match sources" is untrue at HEAD.
- Fix: run `bun run build`, commit the regenerated `dist/` (and the hashed
  asset references in `blog.html`, `ru/blog.html`, `prerender/home.html`
  that change with the CSS hashes).

### A2 — MAJOR: bare `playwright test` fails at collection; e2e entry points broken

- Evidence: `playwright.config.ts` sets `testDir: './tests'` with no
  `testMatch`/`testIgnore`, so Playwright's default pattern also matches
  the 35 vitest files under `tests/unit/` (colocated there by the
  2026-10-02 test-tree move on `main`). Reproduced read-only:
  `bunx playwright test --list` exits 1 with 35 collection errors
  (vitest's `describe()` throws outside a vitest run; first failure
  `tests/unit/Utils/dispose.test.ts:5`) — "Total: 0 tests in 0 files".
  With explicit file filters the real specs list fine (20 portfolio +
  4 teardown tests).
- Impact: `test:serial`, `test:ui`, `test:headed` (`package.json:15,18,19`
  invoke bare `playwright test`) and `test:matrix`
  (`scripts/test-browser-matrix.ts:3` spawns `test:serial`) all fail
  before running a single e2e test; CI's "Production browser matrix" job
  and the README.md:42–43 claim are broken. `test:host-teardown`
  survives (it passes an explicit spec path,
  `scripts/test-host-teardown.ts:5`). Pre-existing on `main`, unnoticed
  because every real run used explicit file filters.
- Fix: one line — `testMatch: '**/*.spec.ts'` (or
  `testIgnore: 'tests/unit/**'`) in `playwright.config.ts`.

### A3 — MINOR: `test-results/.last-run.json` is tracked despite the ignore rule

- Evidence: `git ls-files test-results` shows it; `.gitignore:5` ignores
  `test-results/`; committed in the initial import `ae66977e`.
- Fix: `git rm --cached test-results/.last-run.json` (pure local output).

## B. Renderer-stack leftovers (minor, none affect correctness)

### B1 — dead diagnostic field `renderer.programs`

- Evidence: `src/core/RuntimeResourceSnapshot.ts:23-27` types
  `programs?: unknown[]` and `:86` reads `info?.programs` — the classic
  `WebGLRenderer` shape. three 0.186.1's `Info` exposes
  `info.memory.programs` as a number (`three.webgpu.js:32434`), so the
  field is silently always `null`. Zero consumers read it (DevPanel
  never displays it).
- Fix: delete the field (repo prefers deletion over keeping dead
  surface), or read `info?.memory?.programs ?? null` as `number | null`.

### B2 — stale comment + redundant local type for the device-loss hook

- Evidence: `src/Experience/Renderer.ts:37-42` claims the hook is "not
  declared by the Three type surface" and widens `WebGPURenderer` with
  `DeviceLossCapableRenderer` — but `@types/three`
  `src/renderers/common/Renderer.d.ts:255` now declares
  `onDeviceLost: (info: DeviceLostInfo) => void`.
- Fix: delete the local type, use the declared `onDeviceLost` /
  `DeviceLostInfo` directly, update the comment.

### B3 — stale comments referencing the removed `Experience.setupEnvironment()`

- Evidence: `src/core/EventBus.ts:26-29` ("Experience re-runs
  setupEnvironment()…") and `src/Experience/World/SplashCube.ts:262-265`
  ("Called by Experience.setupEnvironment()"). No such method exists; the
  current chain is `Experience.installRendererRecovery()`
  (`src/Experience/Experience.ts:268-276`) → `jlz:renderer-recovered` →
  `SceneEnvironment.apply()` (`src/Experience/SceneEnvironment.ts:42`).
- Fix: reword both comments to the current names.

### B4 — unit tests resolve a different `three` module graph than production

- Evidence: `vite.config.ts:46-49` aliases `three` →
  `src/three-webgpu-compat.ts` and `three-stdlib` →
  `src/three-stdlib-compat.ts`; `vitest.config.ts` has no `resolve.alias`,
  so `import … from 'three'` in app code under test resolves to the
  classic three build. A symbol that is classic-only today would pass
  units yet be stubbed in production. Currently harmless only because the
  whole-tree audit, `check:stdlib`, and the production build cover the
  skew.
- Fix: mirror the two aliases in `vitest.config.ts`; re-run the 103-test
  suite (the webgpu entry imports cleanly in Node — probed).

## C. Hygiene and hardening (minor)

### C1 — stale "pending slice" comment in WorksInstallation

- Evidence: `src/Experience/World/WorksInstallation.ts:17-19` — "retains
  the two shared NodeMaterials until their own lifecycle slice" reads as
  unfinished migration, but NEXT.md records the settled contract (SFC
  owns geometries; controller owns the two shared materials, disposed
  after Vue unmount).
- Fix: reword to state the settled contract.

### C2 — Vue-chrome DOM selectors hardcoded in scene/UI controllers

- Evidence: `src/Experience/World/BakuCarousel.ts:12-18`
  (`#cinematic-nav, #jlz-fs-overlay, …`) and
  `src/Experience/ExperienceUI.ts:159-165` (`.jlz-works-aperture, …`).
  A Vue-layer rename silently breaks scene input filtering. This is
  input policy and was re-traced as a keep; the hardening is one source
  of truth for the selector strings.
- Fix (optional): lift both selector lists into one shared const module
  next to `contentRoot.ts`.

### C3 — dead uikit typings in `global.d.ts`

- Evidence: `src/types/global.d.ts:29-32` declares module
  `uikit/dist/js/uikit-icons.js` (zero importers; `entry-app.ts:253`
  comments "No uikit-icons import") and `:11` declares `Window.UIkit`
  (no `window.UIkit` reader anywhere — grep-verified).
- Fix: delete both blocks (type-only, zero runtime cost).

### C4 — INFO notes (no action required)

- `src/Experience/World/WorksPlaneStage.ts:61-62` reads
  `window.innerWidth/innerHeight` at construction (harmless: SceneHost
  always forwards a resize).
- `eslint.config.js:18,20` ignore `.claude/**` and `.tmp-pw/**` — dirs
  that never existed in git history (plausible local-tool dirs).
- `package.json` has no `engines` field although the toolchain is
  Bun-pinned (README/CI).
- `esbuild` devDep looks unimported but is load-bearing
  (`vite.config.ts:263` `minify: 'esbuild'`; Vite 8 ships no esbuild) —
  worth a one-line comment.
- `WorksInstallation` mode transforms are a controller/Vue dual-writer
  seam (`WorksInstallation.ts:85-102` vs `WorksInstallation.vue:78-83`)
  — triaged as dynamic in NEXT.md ("Remaining controller-vs-SFC
  inventory"), no re-render trigger exists today; revisit only if props
  ever start changing without a stage remount.

## D. Verified complete (evidence summary)

Re-verified in this audit, not assumed from prior records:

- **Single renderer, both backends**: `unifiedRenderer.ts:97-109` is the
  only `new WebGPURenderer`; `forceWebGL` and the automatic WebGPU→WebGL2
  fallback (`getFallback → WebGLBackend`) match three 0.186.1's
  constructor exactly; `init()` is idempotent (`_initPromise`),
  `dispose()` guarded; sync `render()` only after init; no deprecated
  API calls.
- **Shims are exact**: `check:stdlib` green both directions — the 28
  stdlib re-exports equal the cientos bundle's import list, and every
  deep module's own `three` imports resolve through `three/webgpu` +
  compat stubs (including the Lab `OrbitControls` chain end-to-end);
  the compat file covers the full ~100-symbol cientos `three` surface,
  and `WebGLCubeRenderTarget` is genuinely absent from `three/webgpu`,
  which independently re-confirms the Environment/Stars/Sparkles/Sky
  non-candidate verdict.
- **Tres 5.9.2 interplay**: custom factory consumed once; init awaited
  before the loop starts (no render-before-init race); the notify-only
  render drain, wrapped `invalidate → scheduler demand`, `{off}`
  subscriptions, and the deferred-dispose shim all match the installed
  dist and the recorded keep-verdicts.
- **TSL post pipeline**: every `three/tsl` symbol used in `src/` exists
  in 0.186.1; `RenderPipeline` tone-mapping capture traced (no per-frame
  graph rebuild); `PassNode` live scene/camera refs valid for the
  showreel swap; PMREM applied only post-init.
- **Device loss**: three's dynamic `onDeviceLost` invocation matches the
  app's wrapper; `MAX_DEVICE_LOST_RECOVERIES = 1` bounds the loop
  (unit-tested); the WebGL restore dance matches `WebGLBackend.dispose`.
- **Failure paths**: all failures converge on `jlz:webgl-failed` +
  overlay + owner-first teardown, bounded by the 60 s splash watchdog
  and the 20 s first-draw gate; i18n keys exist EN+RU; no
  unhandled-rejection path found.
- **Zero WebGL-only leftovers**: no GLSL `ShaderMaterial`, no
  `onBeforeCompile`, no `EffectComposer`, no classic `WebGLRenderer`
  construction in `src/`; the two `getContext('webgl2')` hits are the
  legitimate recovery probe/restore of the same canvas; zero
  TODO/FIXME/HACK markers in `src/`.
- **Paradigm**: 22/22 `src/app/scene/*.vue` owners use declarative
  templates with `shallowRef` node adoption — zero DOM access, zero
  imperative scene-graph construction; World controllers own only
  generated geometry, TSL graphs, loader lifecycles, and no-equivalent
  behavior; `SceneCoordinator`/`SceneTransformPass`/`StageRegistry`
  hold exactly their claimed domains; no keep-verdict overturned.
- **Kept imperative UI, precisely characterized**: 967 LOC in `src/UI`
  (CinematicNav 434, FullscreenOverlay 253, TextReveal 107, BlurFade
  100, NoiseText 73) plus 1201 LOC of Experience-side UI controllers —
  every file deliberately kept with a recorded reason, zero dead code;
  full Vue-ification remains a measured non-goal.
- **Content and contracts**: i18n EN/RU 158/158 parity, 0 missing, 0
  duplicates; a11y contracts wired (splash/blog skip links, route
  announcer, dialog semantics, `?no-scene` path, failure overlay);
  prerender routes == router routes == sitemap (30 URLs, EN/RU); entry
  chain, package.json scripts/deps, budgets, blog/content links, and
  config coherence all check out; CaseStudies placeholders are
  intentional per their file header.

## E. Open gates no code change can close

1. **Physical-GPU / native-WebGPU parity** — all runtime evidence to date
   is software-WebGL2; needs a real GPU.
2. **Natural (non-synthetic) device loss** — driven loss and undriven
   synthetic loss are proven; natural loss needs real hardware.
3. **Production ingress** — `justlovejazz.dev` (apex and www) has no live
   DNS and no indexed presence; blocked on deployment, not tooling.

## Proposed solutions (ordered minimal slices)

| Slice | Fixes         | Change                                                                                                                  | Verification                                                                       | Risk                                                |
| ----- | ------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------- |
| S1    | A1            | `bun run build`; commit regenerated `dist/` + hashed refs in `blog.html`, `ru/blog.html`, `prerender/home.html`         | build passes; `git diff --exit-code -- dist …` clean; budgets unchanged            | none (deterministic build, repo convention)         |
| S2    | A2            | `testMatch: '**/*.spec.ts'` in `playwright.config.ts`                                                                   | `bunx playwright test --list` exits 0 listing 24 tests (20 portfolio + 4 teardown) | none                                                |
| S3    | A3            | `git rm --cached test-results/.last-run.json`                                                                           | `git ls-files test-results` empty                                                  | none                                                |
| S4    | B1            | delete the `programs` field from `RuntimeResourceSnapshot` (preferred over repointing — zero consumers)                 | type-check + unit suite                                                            | none                                                |
| S5    | B2, B3        | use declared `onDeviceLost`/`DeviceLostInfo`; drop `DeviceLossCapableRenderer`; reword both `setupEnvironment` comments | type-check + unit suite                                                            | none                                                |
| S6    | B4            | mirror the two `three` aliases into `vitest.config.ts`                                                                  | 103/103 unit suite green under the production module graph                         | low (webgpu entry imports cleanly in Node — probed) |
| S7    | C1            | reword the WorksInstallation header comment to the settled contract                                                     | lint                                                                               | none                                                |
| S8    | C3            | delete the dead uikit module declaration and `Window.UIkit` after a final rg zero-reader pass                           | type-check                                                                         | none                                                |
| S9    | C2 (optional) | lift chrome selector strings into one shared const                                                                      | lint + manual route smoke                                                          | low; defer if unwanted                              |

S1–S2 restore release cleanliness (both CI jobs green); S3–S8 are
mechanical hygiene; S9 is optional hardening at the owner's discretion.
None of them alter the refactor architecture.

## Definition of "complete"

The refactor is complete when: S1–S8 (at minimum S1–S2) have landed with
their verification green, and the three section-E gates are either closed
on real hardware/deployment or explicitly accepted by the owner as
permanently environment-bound. Everything else in this report is
evidence that the architecture itself already holds.
