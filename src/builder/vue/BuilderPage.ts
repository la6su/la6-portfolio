// src/builder/vue/BuilderPage.ts — The public surface for a builder document
// (Phase 9).
//
// Renders a full `BuilderDocument` through the trusted element registry
// (`./elements.ts`): each root node (section) is one `BuilderElement`. This
// is the component the public routes render (Phase 9 slice 5) and the admin
// editor preview renders in builder mode — the same typed registry in both
// contexts, per the page-builder boundary (`docs/PAGE_BUILDER.md`).
//
// Stateless and SSR-safe: it owns no editor state, so it is safe in the
// production public graph and in `renderToString` output alike.

import { h, type Component, type PropType } from 'vue'

import type { BuilderDocument, BuilderNode } from '../schema'
import type { BuilderLocale } from '../localization'
import { BuilderElement } from './elements'

/**
 * A builder document rendered as Vue components (fragment root — one
 * component per root section).
 */
export const BuilderPage: Component = {
  name: 'BuilderPage',
  props: {
    document: { type: Object as PropType<BuilderDocument>, required: true },
    /**
     * Emit the editor delegation attributes on every element (admin preview
     * only — public rendering renders the document read-only).
     */
    editable: { type: Boolean, default: false },
    locale: { type: String as PropType<BuilderLocale>, default: 'EN' },
  },
  render(this: { document: BuilderDocument; editable?: boolean; locale?: BuilderLocale }) {
    return this.document.nodes.map((node: BuilderNode) =>
      h(BuilderElement, {
        key: node.id,
        node,
        editable: this.editable ?? false,
        locale: this.locale ?? 'EN',
      }),
    )
  },
}
