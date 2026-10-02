# Refactor plan

This file is the live work queue for agents. Keep decisions and current
evidence here; put no session diary or repeated implementation history in it.
Update the relevant phase when code or evidence changes.

## Goal and constraints

Deliver a production ready EN/RU portfolio on Vue 3, TresJS 5, Three.js
WebGPU/TSL, and WebGL2 where Three selects that backend. Keep the codebase
small and easy to change. Vue owns UI and declared scene composition; Tres
owns Vue/Three integration and its render host; Three owns GPU primitives and
TSL; Cientos owns controls it already provides. Project code should implement
portfolio behavior, bespoke visuals, and only the browser policy the libraries
do not provide.

Use [TvT.js v5](https://github.com/hawk86104/three-vue-tres) as a reference
for focused declarative composition and framework delegation. Do not copy its
editor or product-specific systems. Prefer deletion or library APIs over new
wrappers. Keep imperative Three code for generated geometry, GPU algorithms,
and behavior with no declarative library equivalent. Do not split files solely
to reduce line counts, preserve abstractions for tests, or optimize without
measured evidence.

## Current architecture and evidence

The app has a persistent Vue shell and Tres canvas. Route views own semantic
content and section state. `SceneHost` declares stable scene owners and lazy
route stages; `Experience` coordinates bespoke story behavior, renderer
pipeline, and demand scheduling; `SceneCoordinator` and
`SceneTransformPass` hold scene update policy and scroll transforms;
`StageRegistry`/`LazyStage` manage route-scoped async scene lifetimes. Unit
tests are under `tests/unit`; browser specs remain under `tests`.

Current known facts:

- Tres 5.9.2's on-demand mode still runs loop ticks. The app's custom scheduler
  opens and closes Tres's loop because its WebGPU/TSL pipeline and scene
  animations require it. Keep this seam until render ownership moves back to
  Tres's callback.
- SceneHost adopts one Tres scene, camera, and renderer. Tres selects
  WebGPU/WebGL2 through Three's `WebGPURenderer`; the same TSL post graph works
  on both backends. Low tier skips full-screen post as a quality policy.
- Stage lifetimes differ by route: Works waits for mounted assets; Cyprus
  prewarms and follows Contact activation; Lab remains mounted after leaving
  `/lab`; other stages release on route exit. Keep these behaviors while
  reducing their implementation.
- Resource disposal waits for Vue/Tres to detach declared nodes before GPU
  release. Host renderer disposal is deferred until scene owners unmount.
- Generated `dist/`, blog HTML, home prerender, and sitemap are tracked release
  inputs; CI rebuilds them and verifies they match their sources.
- CI previously repeated Vue type-check and stdlib compatibility checks after
  `bun run build`, which already runs both; the duplicate workflow steps are
  removed.
- The unit suite was moved out of `src`; no test run is claimed by this plan.
- `SceneTransformPass` returns its active/from/to configs and section index;
  Experience no longer re-reads route sections or looks phase ids up in a
  duplicate config Map.
- Tres 5.9.2 propagates a parent's disposal policy during subtree removal.
  Resource-owned static subtrees now set `dispose: null` once at their root;
  per-node overrides remain where a child is removed independently.
- Package metadata and TSL article now describe Three's automatic backend
  selection and one app-authored TSL graph. Removed claims of bit-identical
  output and a future percentage-based fallback removal; neither had evidence.
- Story scroll normalization now shares the canonical main-position clamp;
  DOM navigation and frame-driven scene arrival keep their separate clocks.
- Renderer update no longer hides a missing render pipeline by drawing directly
  through WebGPURenderer. Recovery already closes the frame window while the
  pipeline is absent; normal frames now require the owned pipeline. Low-tier
  direct rendering remains an explicit policy inside `RenderPipeline`.
- Production build and bundle budgets passed after the latest renderer
  simplification (`fd13967`). The user confirmed physical Firefox WebGPU and
  TSL post-processing. Firefox's compatibility feature-level notice comes
  from Three/browser support. Playwright Firefox exercised WebGL2; WebKit
  remains unverified.
- Three's WebGPU entry and the app's Three imports are aliased to one dev core.
  A previous Firefox cold-start check observed one core, but the user now
  reports `Multiple instances of Three.js` again. Treat duplicate-core
  elimination as unverified until a fresh Firefox startup and lazy Cientos
  route activation both stay on one optimized core; inspect optimizer cache
  invalidation before adding more compatibility code.
- This workspace had 738 abandoned `.vite/deps_temp_*` directories (14 GB)
  and no running Vite process. The temporary optimizer caches were removed.
  This cleans local disk and stale cache state; it does not prove the browser
  warning is fixed, so repeat the duplicate-core check on the next dev run.
- Current direct runtime pins match the latest releases checked on
  2026-10-02: Vue 3.5.43, Tres/Cientos 5.9.2, Three 0.186.1, Vue Router 5.3.1,
  Vite 8.3.2 and UIkit 3.25.25. TypeScript 7 support through the current
  `vue-tsc` path is not established; keep the verified TypeScript 6 toolchain
  until upstream support is confirmed. `bun outdated` could not reach npm due
  to DNS, so transitive dependency freshness is still unverified.

## Work queue

### 1. Reduce runtime ownership overlap — active

Trace callers and state before changing boundaries. For each method in
`Experience`, `SceneCoordinator`, `SceneTransformPass`, `StageRegistry`,
`LazyStage`, `ExperienceUI`, and `SceneHost`, record its distinct behavior and
owner. Then remove forwarding, mirrored state, and wrappers that duplicate
Vue/Tres/Three/Cientos. Preserve the actual route lifecycle differences and
detach-before-dispose ordering.

Audit these seams specifically:

- SceneHost readiness slots, renderer sizing/DPR, loop/invalidate bridge, and
  deferred renderer disposal against Tres's public API.
- Vite dev dependency optimization and every lazy Three/Cientos entry against
  the reported Firefox duplicate-core warning; distinguish optimizer restarts
  from simultaneously loaded core modules.
- Experience versus SceneCoordinator ownership of route policy, frame fan-out,
  and render demand.
- StageRegistry versus LazyStage versus `useSceneStages`; retain only shared
  async lifecycle mechanics used by distinct stage contracts.
- ExperienceUI versus route views for duplicate navigation/section state.
- Startup cancellation, renderer recovery, init failure, no-scene mode, and
  teardown completion.

Exit when each retained boundary has one owner, callers are explicit, and
startup/failure/route-change/teardown paths preserve behavior without duplicate
route or renderer authority.

### 2. Make scene composition declarative where it helps — active

Inventory scene owners as stable declared nodes, loaded assets, generated
geometry/TSL, or route-lazy behavior. Stable transforms and hierarchy belong
in Vue/Tres props. Keep imperative code for live animation and algorithms.
Compare custom control, loader, material, disposal, easing, and capability
helpers with the APIs already installed; delete duplicates when parity is
clear. Remove dead exports, dependencies, compatibility shims, and build
configuration only after checking their real consumers.

Reviewed static transforms in five owners now use Tres props. Lab uses
Cientos OrbitControls. TSL remains one shared graph across WebGPU and WebGL2;
graph errors reach the normal failure path instead of silently switching
render modes. Three's `RenderPipeline.render()` temporarily disables tone
mapping only after updating its captured output transform, so the narrow
project guard around graph rendering is still required to keep that transform
at `NoToneMapping`. Continue the full owner and helper inventory.

Exit when every scene node and GPU resource has an explicit owner, no helper
duplicates a library feature, and continuous frames are requested only by
visible motion or user activity. Record performance claims only with actual
measurements.

### 3. Production and whole-tree audit — pending

Review direct route entry, accessibility, reduced motion, locale switching,
responsive behavior, renderer failure, content generation, asset paths,
deployment output, scripts, and dependencies. Remove obsolete components,
styles, docs, and shims once their consumers are verified. Re-scan the complete
tree for parallel old/new implementations, dead code, stale claims, and
unnecessary abstractions. Update this plan from findings and stop when each
remaining complexity has a concrete product or platform reason.

The existing Prettier scripts have no repository config or generated-file
ignore list; the default project-wide check flags authored files and generated
artifacts. Define a safe formatting contract after architecture changes so a
format command cannot rewrite build output or impose Prettier defaults.

Exit with a clean production build, browser/lifecycle evidence in the engines
available, WebGPU/TSL evidence on supported hardware, automatic WebGL2 backend
selection where WebGPU is unavailable, and no unexplained compatibility seam.
State any engine or hardware coverage that could not be verified.

## Working rules

- Read repo instructions, callers, and installed library APIs before changing
  ownership.
- Make coherent slices that remove the replaced path in the same change.
- Do not add or run tests unless requested. A production build may be used for
  type, compatibility, prerender, bundle, and release validation.
- Do not claim runtime, browser, or performance evidence beyond what ran.
- Keep generated `dist/` and deployment workarounds only after verifying their
  consumers.
- Update this queue when evidence or phase status changes; commit completed
  slices with a message describing the simplification.

## Status

Phases 1, 2, and 3 remain active. Prior work has removed the
app-authored renderer backend recreation, silent TSL render fallback, duplicate
route-mount flag, duplicate route state, repeated frame config lookups, and a
dead particle branch. The host contract now belongs to the Experience runtime;
Three selects the backend; Showreel shares the TSL graph; and static scene
transforms use Tres props in reviewed owners. These are partial reductions,
not proof that the architecture or project is production ready. Continue with
the source ownership audit, then revise status from concrete findings.
