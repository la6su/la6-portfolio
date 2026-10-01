# Refactor plan — la6-portfolio

This is the repository's only work queue. Keep it current and actionable:
update phase status and evidence when work changes; do not append session logs.
Removed project documents are not requirements and must not be reconstructed.

## Objective and architecture

Deliver a production-ready EN/RU portfolio based on Vue 3, TresJS, Three.js
WebGPU and TSL, with a working WebGL 2 fallback and usable semantic content
when no renderer can start. Use
[three-vue-tres](https://github.com/hawk86104/three-vue-tres) as the reference
for declarative Vue/Tres scene composition and focused behavior components.
Adopt its relevant patterns, not its unrelated editor, plugin, or publishing
systems.

Keep the architecture small and legible. Vue owns application and scene
hierarchy; Tres owns component and renderer integration; Three owns rendering
primitives and GPU APIs; Cientos owns its controls/helpers. Project code owns
only product-specific behavior: story-to-world mapping, scene transitions,
render-demand policy, TSL effects, backend recovery, and async resource
lifecycle. Every persistent DOM/GPU resource has one owner and a visible
cleanup path. Prefer library behavior when it supplies the same contract;
preserve custom policy only when code or measurements prove the difference.

## Agent workflow

1. Read `AGENTS.md`, this plan, `package.json`, and affected sources before a
   structural change. Trace runtime, build, generated-content, and test callers
   before deleting anything.
2. Work in vertical slices: name the ownership change, make the smallest
   complete source change, run relevant gates, update this plan, and commit it.
3. Prefer Vue/Tres declarations for stable nodes and props. Keep imperative
   code for algorithms or Three APIs that cannot be expressed cleanly in Vue.
   Do not merge or split modules based on line count alone.
4. Do not claim browser, GPU, WebGPU, recovery, accessibility, or performance
   evidence beyond what was actually exercised. Record real remaining gaps.
5. Keep generated `dist/` state intact until its external deployment consumer
   is identified; do not stage unrelated build output with source commits.

## Current audit decisions

- The source tree is already mostly declarative for the scene: `SceneHost.vue`
  and owner SFCs declare stable roots and leaves; controllers adopt those nodes
  and own algorithms/resources. Continue the audit for remaining parallel
  construction and duplicated disposal.
- `SceneCoordinator` and `SceneFramePass` remain separate: one coordinates
  story/route/transforms and policy, the other owns the per-frame owner
  fan-out. `SceneTransformPass` contains the scroll-to-world mapping algorithm.
  Their current call graph does not justify merging them.
- Keep `RenderScheduler`: Tres 5.9.2 on-demand gates renderer calls but retains
  its RAF loop; this project also requires zero idle ticks, settled activity
  windows, and hidden-tab pause/resume. Reconsider only if equivalent behavior
  is verified against installed Tres source and browser evidence.
- Keep the typed `EventBus` for communication across the classic HTML shell,
  Vue router/views, and independently owned runtime/UI controllers. Do not
  replace it with another abstraction absent a concrete same-owner duplicate.
- `ErrorTracker` was removed: it duplicated native console reporting and
  suppressed unhandled rejection visibility. Boot failures remain explicitly
  caught and shown by the app shell.
- The persistent top bar/contact launcher now lives declaratively in
  `app/PersistentConsole.vue` under `AppShell`; `CinematicNav` retains native
  scroll, story position, input, and hash behavior. Fullscreen media owners
  remain imperative for now; audit their structure/lifecycle separately.

## Phases

Status: `active`, `queued`, or `done`. Mark a phase `done` only when its stated
acceptance evidence exists.

### 0. Repository and production baseline — active

**Established:** repository/package identity matches `la6su/la6-portfolio`;
current Vue/Tres/Three/Vite dependencies and build scripts are used; installed
dependencies are not tracked; generated blog and builder inputs have known
sources and build consumers; scripts/dependencies and Node/Bun boundaries were
audited with no proven unused direct dependency. CI contains unit, type, lint,
repository, and browser jobs.

**Remaining:** identify the deploy consumer for tracked `dist/` (84 tracked
files in the last audit) before changing its tracking policy; prove clean
checkout install/build and deployed static routing/cache behavior. `public/`
headers do not establish whether Cloudflare Pages or Netlify consumes the
output.

**Accept when:** frozen install, repository checks, production build/budgets,
generated-route checks, and the actual deploy contract are reproducible.

### 1. Declarative scene ownership — active

**Established:** Tres/Vue declares camera, lights, environment, section roots,
feature roots and many mesh leaves. Works cards, carousel cards, typography,
ink, Cyprus, Lab, particles, environment, and showreel portal use owner SFCs.
Controllers adopt Vue nodes; resource disposal has explicit owners. Section
groups no longer synthesize fallback roots; Works metadata no longer uses a
WeakMap attachment bag.

**Next audit:** inventory every remaining `new THREE.*`, `scene.add/remove`,
`primitive`, `:dispose="null"`, and manual child insertion under
`src/Experience` and `src/app/scene`. For each, record whether it creates
stable hierarchy or a runtime algorithm/resource. Move only stable hierarchy
to Vue and preserve focused disposal coverage. Inspect the remaining
FullscreenOverlay/ShowreelConsole DOM construction as the UI counterpart.

**Accept when:** scene hierarchy has one Vue/Tres owner, adopted nodes have one
resource-disposal owner, and route mount/release cycles show no detached nodes,
leaks, or duplicate construction.

### 2. Runtime orchestration and lifecycle — active

**Established:** Tres `delta` is forwarded through SceneHost; the duplicate
`Experience/Time` clock is removed. Device capability is snapshotted outside
camera updates. `Experience.destroy()` and async lazy-stage release have
focused tests. The unused global error tracker is removed. Route-specific
stage contracts remain separate from the generic stale-request lifecycle.

**Next audit:** trace `Experience.ts` end to end and test every remaining
boundary before simplifying: `ExperienceUI`, `StageRegistry`/`LazyStage`,
`UIManager`, readiness, renderer replacement, and teardown. Collapse only
forwarding state or duplicate owners. Confirm listeners, timers, observer,
RAF, media, controls, pending imports, and renderer candidates reach terminal
cleanup on route leave, boot failure, recovery, and Vue unmount.

**Accept when:** one composition root coordinates runtime; initialization,
route changes, recovery, and teardown are idempotent and covered by tests;
no abandoned async task can reattach resources.

### 3. WebGPU, TSL, fallback, and scheduling — active

**Established:** WebGPU and WebGL backend selection is capability-based;
software/fallback policy and accessible no-GPU continuation exist. Demand
rendering coalesces invalidations and pauses on hidden tabs. Renderer recovery
is bounded and tested at policy/DOM boundaries; a device snapshot avoids
per-frame capability detection.

**Remaining:** exercise actual WebGPU and forced WebGL renderer recovery on
physical GPU hardware. Local Chromium/Firefox production suites currently use
software WebGL; an earlier SwiftShader context-loss scenario did not recover,
so hardware recovery remains unresolved. Audit TSL graph/material ownership,
shader compile/prewarm behavior, CanvasTexture parity, resize/DPR, idle draw
counts, and route resource plateaus from measurements.

**Accept when:** actual backend behavior is evidenced on supported hardware;
no-WebGPU uses WebGL 2 where available; no-GPU retains accessible content;
recovery/teardown work on a real device; settled scenes produce no unnecessary
loop/draw or unbounded route resource growth.

### 4. App shell, content, accessibility, and browser support — active

**Established:** SPA routes, EN/RU metadata, standalone blog/builder pages,
browser history, unknown-route fallback, menu/modal keyboard focus, reduced
motion, mobile overflow, and touch scrolling have production-browser coverage.
Persistent console markup and state are Vue-owned. Firefox is confirmed by the
user and the local suite.

**Next audit:** review the remaining imperative overlays and route transitions
against Vue ownership; walk EN/RU routes, direct deep links, hash navigation,
focus, contrast, touch targets, resize/orientation, no-scene and renderer
failure states. Run the production suite in Safari/WebKit. The local WebKit
binary cannot launch because this host lacks `libicu74`, `libxml2`, and
`libflite1`; CI installs browser dependencies and is the current execution
path.

**Accept when:** route/content and accessibility essentials pass desktop and
mobile production walks in Chromium, Firefox, and Safari/WebKit; the portfolio
remains navigable without GPU initialization.

### 5. Performance, dead code, and release audit — active

**Established:** project-owned interpolation helpers were replaced with
Three's `MathUtils`; unused device getters and compatibility alias, duplicate
clock, Works WeakMap metadata, and global error tracker were removed. The
preloaded Commissioner font is WOFF2. Large media was reduced and unreferenced
assets removed after source/content searches. Current source slices passed
Chromium and Firefox production suites, Vue type-check, lint, and 73 unit
tests.

**Next audit:** finish source-to-output inventory for assets, routes, scripts,
CSS, content generators, tests and package scripts. Remove each proven dead or
duplicate path in a focused commit. Inspect route chunk sizes, texture/font
cost, CPU frame work, GPU allocations, and build budgets; use measured results
and retain deploy-required artifacts. Then perform a fresh full source review
against this plan and record the release audit evidence.

**Accept when:** clean install/build, all deterministic checks, Chromium/
Firefox/WebKit browser matrix, actual GPU/recovery evidence, route/resource
stress, deployment contract, and hardware-specific performance results pass;
no known dead active path or unowned persistent resource remains.

## Current checkpoint — 2026-10-01

**Latest committed source slice:** `8ab63c4 refactor: move persistent console
into Vue shell`. The previous commits removed duplicate global error handling
and recorded why the scene coordinator/frame pass and typed bus remain. Source
and plan are clean; build output under tracked `dist/` is modified by the
production build and remains unstaged.

**Verification:** `bun run type-check:vue`, `bun run lint`, and
`bun run test:unit` pass (24 files / 73 tests). Production Chromium passes
(14 passed, 3 opt-in renderer scenarios skipped) and Firefox passes
(13 passed, 4 skipped); each Playwright run builds production output and checks
budgets. Both use software rendering here, not physical-GPU WebGPU. WebKit and
real-device recovery/performance remain open.
After the final reactive UIKit icon and no-scene visibility adjustments, the
production navigation-focus and reduced-motion tests passed again in Chromium
and Firefox (4/4 total), with Vue type-check clean.

**Next action:** continue phase 1's source-to-owner inventory and phase 4's
remaining imperative overlay audit. Make the next code change only after
identifying a concrete duplicated owner or stable hierarchy still constructed
outside Vue. Preserve `dist/` until its deployment consumer is established.

## Follow-on goal policy

Only after this plan's full release acceptance is evidenced, perform a fresh
independent audit across application code, generated content, dependencies,
assets, deployment, and runtime. Use/install additional skills only when a
finding needs that domain review. Derive a new phased plan and autonomous goal
from evidence, then repeat audit → plan → implementation → verification until
production-quality architecture and performance gates pass. Do not create that
follow-on goal before release acceptance; keep one canonical work queue.
