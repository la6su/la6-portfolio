---
name: uikit3
description: Apply UIkit component/Less contracts and the JUSTLOVEJAZZ builder catalogue, inspector, preview and Style workflow.
---

# UIkit and builder

Inspect the installed UIkit source/types for the affected component; versions
belong to `package.json`/`bun.lock`. Use `uk-*` classes and component attributes;
UIkit owns its behavior, focus and ARIA through the Vue lifecycle boundary.
Override Less variables/hooks rather than creating a competing state machine.

[Brand/theme](../../docs/BRAND.md) owns token/assembly paths. Keep
`src/core/brandTokens.ts` aligned with Less and its parity tests. Product icons
come from `registerConsoleIcons()`; the full official icon plugin belongs to
`admin/style-icons.ts`. Verify inserted SVGs after UIkit's async update.
Commissioner headings use natural case; monospace metadata may use uppercase.

## Builder workflow

Read [Page Builder](../../docs/PAGE_BUILDER.md) for schema, save and publishing.
Use YOOtheme's catalogue/outline/preview/grouped-inspector/Style organization
as a UX reference, not another runtime dependency.

- `catalog.ts` owns element defaults and grouped fields; the inspector consumes
  those groups without duplicating them.
- `src/builder/vue/` is the shared preview/public registry; `render.ts` is a
  reference/test adapter. Persist the collection in `generated/documents.json`.
- Edit typed style allowlists, compiler mappings, `themeVariables.ts` and
  showcase together. Keep generated variables last in the assembly.
- Match preview fonts, icons, tokens and responsive behavior to compiled output.
  The editor shell is desktop-oriented; viewport modes resize the preview.
- Preserve command/history and shared locale-port behavior. Do not add arbitrary
  authored code or remote sources as an incidental editor change.

Check affected schema/compiler/registry tests, token parity, Vue types and build.
Exercise changed elements at all preview widths, default/inverse and EN/RU;
verify undo through real keyboard input. Save only when persistence is part of
verification; restore test content. Public output must exclude editor code.
