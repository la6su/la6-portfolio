# Open work

Only unfinished outcomes. The user's task takes priority; the declarative
transition continues slice by slice (see the architecture plan below).
Implement one useful slice at a time and remove completed items.

## Portfolio architecture and production plan (2026-09-28)

Audit baseline: `main` @ `9a16a957`. The project already uses Vue 3, TresJS 5,
Cientos, one persistent `TresCanvas`, a custom Three `WebGPURenderer`, TSL
materials, a demand-driven Tres loop, lazy route stages and an actual-backend
policy. A wholesale Vue rewrite or a second renderer would duplicate owners.
The TvT example is an inspiration for scene authoring, not a drop-in runtime:
evaluate individual components against TSL, disposal and lazy-delivery rules
in `docs/ARCHITECTURE.md`. Existing tests are extensive; remove a test only
when its behavior is deleted or another test demonstrably covers the same
contract. Keep this queue as the single plan and retire completed slices.

### Active architecture work

1. **Continue lifecycle simplification.** Review the remaining `Experience`
   responsibilities around boot coordination, carousel initialization and
   renderer recovery. Extract an owner only when it reduces the public surface
   and preserves route, teardown and recovery ordering.
2. **Evaluate remaining scene construction.** For each row in the migration
   ledger in [Architecture](docs/ARCHITECTURE.md#tvt-tres-adoption-boundary),
   trace construction, update, resource and disposal ownership. Move geometry
   into Tres components when that removes an imperative construction owner;
   retain TSL uniforms, pooled resources and async GLTF ownership where needed.
3. **Review static delivery and stale contracts.** Check source reachability
   from Vite and SSG entries, generated inputs, metadata/canonical URLs and
   documentation claims. The current audit confirms the split is intentional:
   `/services`, `/works`, `/manifesto`, `/lab` and `/contact` are SPA fallback
   routes, while `/blog/*` and approved `/p/*` pages are concrete Vite/SSG
   inputs. Remove obsolete tests and compatibility code only after verifying
   the currently installed package imports.
4. **Release inputs.** Resolve the media, proof, contact provider and target
   host decisions under Product / input needed below. The 16.35 MB
   `coming-soon.mp4` is a labelled placeholder; optimize its approved
   replacement with a poster and measured encoding budget.
5. **Continue the test audit by owner.** Use [Test audit](docs/TEST_AUDIT.md)
   to review one coherent subsystem at a time. Require owner-boundary evidence
   before removing private-field or source-inspection tests.

### User-deferred final gates

The full Bun pipeline (`build`, `check:stdlib`, `budget`, documentation gate),
serial Playwright Chromium, physical native WebGPU, automatic WebGL fallback,
device-loss recovery on a real browser/driver and desktop/mobile visual QA in
EN/RU with reduced motion are explicitly postponed. They remain required
release evidence; unit tests and a direct Vite build do not close them.

## Brand implementation

Direction: [BRAND](docs/BRAND.md). Refine the existing console and shared world;
these are product slices, not prerequisites for unrelated work. Business
positioning and copy for Home/Services is aligned with BRAND (business-first
language, concrete automation, delivery speed separated from runtime
performance, no music-led interpretations); the case chapters in
`src/Data/CaseStudies.ts` already follow the BRAND chapter structure with
factual claims until approved proof arrives.

1. **Typography and controls:** polish one representative Works screen in EN/RU,
   desktop/mobile and dark/inverse. Audit tiny metadata (`.jlz-meta-text` defaults
   to 0.62rem), spacing, focus and all control states; extend the proven pattern.
2. **Signature spatial transition:** prototype Works room → case using the
   existing installation/showreel owners. Coordinate aperture/material, camera
   and DOM timing; verify reversal/interruption, reduced motion and both backends.
   Resolve the shared still/video contract in this slice before generalizing it.
3. **Section spaces and microinteraction pass:** develop the route characters
   in BRAND incrementally; share materials/motion rules, not identical scenes.
   Polish entry, hover/press, loading, exit and return; keep mobile composition
   and settled render demand intentional.

## Delivery evidence

1. **Three delivery review.** Keep the current chunk and budget policy unless
   a measured result justifies changing it. Regenerate bundle breakdown and
   live/soak evidence on a supported browser/server before release; record
   the actual backend, startup, active-frame p95, idle zero-draw behaviour,
   teardown trend and recovery result.
   The current local Vite rebuild is aligned with source (no stale
   `WorksPortfolio`/five-root runtime remains in `dist/`); measured gzip is
   295.7 kB for shared Three, 53.0 kB for UIkit and 2.1 kB for splash startup,
   all within the existing budgets. The full Bun pipeline still needs to run
   in the release environment because it also regenerates blog, builder and
   sitemap inputs.
2. **Integration branch (user-deferred).** If the user elects to restore the
   `dev` workflow, back up its obsolete history, align it with `main`, add it
   to CI, and update the release instructions in the same delivery.

## Product / input needed

- **Works:** check ultrawide/short-landscape layouts on physical WebGPU and
  WebGLBackend as the brand slices land. Follow BRAND for scene direction;
  approved case-specific copy and proof still come from the user.
- **Media:** replace labelled Porsche 911 Spider, Alise, 19 Lab, Pro193 and reel
  placeholders when approved assets/proof arrive. Prepare posters/sizes/lazy
  load. The current `public/assets/projects/` folders (`ebb-vibes/`,
  `mono-sunday/`, `nocturne-blue/`, `till-at-night/`) hold the ACTIVE case
  covers — each is swapped in the same change that lands its approved
  replacement, so no unreferenced residue remains in between.
- **Deployment:** verify SPA deep links, blog/builder HTML, assets and canonical
  URLs locally, then on the actual host; deployment target is needed.
- **Contact:** connect real delivery once the user chooses/authorizes a provider;
  keep the current non-sending form honest.

Physical WebGL device-loss restoration remains user-deferred until a suitable
browser/driver is available. Unit tests and manual route smoke do not close it.
