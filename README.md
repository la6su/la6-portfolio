# JUSTLOVEJAZZ

EN/RU portfolio of technology and design solutions for business, combining
creative direction, automation, performance and distinctive visual craft.
Shared 3D scene, case studies, standalone blog and development-only page builder;
Vue 3, Vue Router, TvT.js V5 Three.js TSL × Vue 3 × TresJS Cientos｜ICEGL,
UIkit Less, Vite and Bun.

```bash
bun install
bun run dev
```

`bun run dev` binds Vite to `127.0.0.1` and disables Vite HMR. A reverse proxy
on the same machine can forward to that loopback address; configure access
control at the proxy before exposing the development server remotely. For a
direct local/LAN connection whose proxy forwards WebSockets, use
`bun run dev:hmr` to enable Vite's built-in hot updates.

SPA: `/`, `/services`, `/works`, `/works/:projectId`, `/manifesto`, `/lab`,
`/contact`. Static HTML: `/blog`, `/blog/<slug>`, approved `/p/<slug>` and
`/p/<slug>/ru/`. Dev editor: `/admin/`. Works media includes labelled placeholders;
contact form delivery is not connected.

## Quality checks

```bash
bun run test:unit
bun run test:serial
bun run test:host-teardown
bunx playwright install --with-deps chromium firefox webkit
bun run test:matrix
```

`test:serial` runs the production Chromium suite. `test:host-teardown` uses a
development build to unmount the real Vue app and verify scene-owner disposal
precedes renderer disposal. `test:matrix` runs production browser checks in
Chromium, Firefox and WebKit; CI installs all three browser runtimes.
