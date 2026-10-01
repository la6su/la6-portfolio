---
name: uikit3
description: Apply UIkit component and Less contracts for the JUSTLOVEJAZZ interface.
---

# UIkit styling

Inspect the installed UIkit source/types for the affected component; versions
belong to `package.json`/`bun.lock`. Use `uk-*` classes and component attributes;
UIkit owns its behavior, focus and ARIA through the Vue lifecycle boundary.
Override Less variables/hooks rather than creating a competing state machine.

`src/assets/_import.less` owns the theme tokens; runtime canvas consumers read
the compiled CSS custom properties. Avoid a second token catalogue. Product icons
come from `registerConsoleIcons()`. Verify inserted SVGs after UIkit's async update.
Commissioner headings use natural case; monospace metadata may use uppercase.

Keep UIkit as the component and interaction owner. Add project-specific Less
only for visual behavior the library does not provide.
