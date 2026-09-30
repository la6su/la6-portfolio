import type { BuilderDocument } from './schema'
import { DEFAULT_BUILDER_THEME } from './style'

export const DEFAULT_BUILDER_DOCUMENT: BuilderDocument = {
  version: 2,
  slug: 'studio-page',
  title: 'Studio page',
  // Absent/unset means unpublished — a fresh document never reaches the
  // public `/p/<slug>` routes until the editor approves it (slice 5).
  published: false,
  theme: { ...DEFAULT_BUILDER_THEME },
  nodes: [
    {
      id: 'hero-section',
      type: 'section',
      props: { style: 'default', size: 'large', container: 'default' },
      children: [
        {
          id: 'hero-grid',
          type: 'grid',
          props: { columns: '2', gap: 'large' },
          children: [
            {
              id: 'hero-copy',
              type: 'card',
              props: { style: 'default', size: 'large' },
              children: [
                {
                  id: 'hero-heading',
                  type: 'heading',
                  props: { content: 'Build the scene. Keep the soul.', level: 'h1', size: 'small' },
                  children: [],
                },
                {
                  id: 'hero-text',
                  type: 'text',
                  props: {
                    content: 'A UIkit-first page assembled inside the JUSTLOVEJAZZ theme.',
                    style: 'lead',
                  },
                  children: [],
                },
                {
                  id: 'hero-button',
                  type: 'button',
                  props: { label: 'Start a project', href: '/contact', style: 'primary' },
                  children: [],
                },
              ],
            },
            {
              id: 'hero-note',
              type: 'card',
              props: { style: 'secondary', size: 'large' },
              children: [
                {
                  id: 'hero-note-heading',
                  type: 'heading',
                  props: { content: 'Runtime boundary', level: 'h2', size: 'small' },
                  children: [],
                },
                {
                  id: 'hero-note-text',
                  type: 'text',
                  props: {
                    content:
                      'The editor stays in dev. Only this document and its required UIkit styles ship.',
                    style: 'default',
                  },
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}
