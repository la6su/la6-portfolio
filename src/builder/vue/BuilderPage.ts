// Public rendering surface for a BuilderDocument. Published pages and the
// admin preview share the same typed element registry. Stateless and SSR-safe.

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
