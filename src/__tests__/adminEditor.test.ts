// src/__tests__/adminEditor.test.ts — Phase 4 SFC migration.
//
// Two layers: the `useAdminEditor` composable (the editor core, driven with
// stub elements + a mocked fetch) and the `AdminApp.vue` SFC (a jsdom mount
// that renders the catalogue / outline / preview from the default document
// and dispatches the store on click).

import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'

vi.mock('uikit', () => ({
  default: { update: vi.fn() },
}))

import AdminApp from '../admin/AdminApp.vue'
import { DEFAULT_BUILDER_DOCUMENT } from '../builder/default-document'
import { useAdminEditor, type AdminEditorElements } from '../admin/useAdminEditor'
import type { BuilderDocument } from '../builder/schema'

// jsdom has no scrollIntoView / matchMedia; the composable's DOM effects hit
// them, so stub the prototypes for the mount tests.
Element.prototype.scrollIntoView = vi.fn()
// jsdom does not ship CSS.escape; stub the minimal identity form.
const cssNamespace = globalThis as { CSS?: { escape?: (value: string) => string } }
if (!cssNamespace.CSS?.escape) cssNamespace.CSS = { escape: (value) => value }
window.matchMedia = vi.fn().mockReturnValue({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
} as unknown as MediaQueryList)

const secondDocument = (): BuilderDocument => {
  const document = JSON.parse(JSON.stringify(DEFAULT_BUILDER_DOCUMENT)) as BuilderDocument
  document.slug = 'about'
  document.title = 'About'
  return document
}

const jsonDocument = JSON.stringify(DEFAULT_BUILDER_DOCUMENT)
const mockFetch = (): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      const path = url.split('?')[0]!
      if (path === '/__jlz-admin/documents') {
        return {
          ok: true,
          json: async () => ({
            version: 1,
            documents: [DEFAULT_BUILDER_DOCUMENT, secondDocument()],
          }),
        } as Response
      }
      if (path === '/__jlz-admin/document') {
        const slug = new URL(url, 'http://localhost').searchParams.get('slug')
        return {
          ok: true,
          json: async () => (slug === 'about' ? secondDocument() : JSON.parse(jsonDocument)),
        } as Response
      }
      return {
        ok: true,
        json: async () => ({ ok: true, cssBytes: 123, components: ['grid'] }),
      } as Response
    }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const makeElements = (): AdminEditorElements => {
  const preview = ref<HTMLElement | null>(document.createElement('div'))
  const inspectorFields = ref<HTMLElement | null>(document.createElement('div'))
  const inspectorTitle = ref<HTMLElement | null>(document.createElement('h2'))
  const saveStatus = ref<HTMLElement | null>(document.createElement('output'))
  const titleInput = ref<HTMLElement | null>(document.createElement('input'))
  const slugInput = ref<HTMLElement | null>(document.createElement('input'))
  const descriptionInput = ref<HTMLElement | null>(document.createElement('input'))
  const publishedCheckbox = ref<HTMLElement | null>(document.createElement('input'))
  const documentSelect = ref<HTMLSelectElement | null>(document.createElement('select'))
  const saveButton = ref<HTMLButtonElement | null>(document.createElement('button'))
  const undoButton = ref<HTMLButtonElement | null>(document.createElement('button'))
  const redoButton = ref<HTMLButtonElement | null>(document.createElement('button'))
  // The preview / inspector hosts need the data-attribute delegation.
  preview.value!.id = 'builder-preview'
  return {
    preview,
    inspectorFields,
    inspectorTitle,
    saveStatus,
    titleInput,
    slugInput,
    descriptionInput,
    publishedCheckbox,
    documentSelect,
    saveButton,
    undoButton,
    redoButton,
  }
}

describe('useAdminEditor', () => {
  it('loads the saved document and reports Ready', async () => {
    mockFetch()
    const editor = useAdminEditor(makeElements())
    await editor.loadDocument()
    expect(editor.statusMessage.value).toBe('Ready')
    expect(editor.store.document.title).toBe(DEFAULT_BUILDER_DOCUMENT.title)
  })

  it('falls back to the defaults with an error status on load failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, json: async () => ({}) }) as Response),
    )
    const editor = useAdminEditor(makeElements())
    await editor.loadDocument()
    expect(editor.statusMessage.value).toBe('Saved document is unavailable; using defaults')
    expect(editor.store.document.nodes).toHaveLength(DEFAULT_BUILDER_DOCUMENT.nodes.length)
  })

  it('adds an element through the command dispatch and marks the document dirty', async () => {
    mockFetch()
    const elements = makeElements()
    const editor = useAdminEditor(elements)
    await editor.loadDocument()
    editor.addElement('section')
    await nextTick()
    expect(editor.store.document.nodes).toHaveLength(DEFAULT_BUILDER_DOCUMENT.nodes.length + 1)
    expect(editor.store.isDirty()).toBe(true)
    expect(editor.statusMessage.value).toBe('Unsaved changes')
    expect(elements.saveButton.value?.disabled).toBe(false)
  })

  it('undoes via the Ctrl+Z shortcut and restores the clean baseline', async () => {
    mockFetch()
    const editor = useAdminEditor(makeElements())
    await editor.loadDocument()
    editor.addElement('section')
    await nextTick()
    const event = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })
    editor.onDocumentKeydown(event)
    await nextTick()
    expect(editor.store.document.nodes).toHaveLength(DEFAULT_BUILDER_DOCUMENT.nodes.length)
    expect(editor.statusMessage.value).toBe('Ready')
  })

  it('syncs the theme through a field input and the hex peer', async () => {
    mockFetch()
    const elements = makeElements()
    const editor = useAdminEditor(elements)
    await editor.loadDocument()
    // Two controls share the theme prop (the hex + swatch row).
    const hex = document.createElement('input')
    hex.dataset.themeProp = 'accent'
    hex.value = '#123456'
    elements.inspectorFields.value!.append(hex)
    const event = new Event('input', { bubbles: true })
    Object.defineProperty(event, 'target', { value: hex })
    editor.onFieldInput(event)
    expect(editor.store.document.theme.accent).toBe('#123456')
  })

  it('selects a node from the preview delegation target', async () => {
    mockFetch()
    const editor = useAdminEditor(makeElements())
    await editor.loadDocument()
    editor.selectNode('hero-section')
    await nextTick()
    expect(editor.store.selectedId).toBe('hero-section')
    expect(editor.inspectorLocation.value?.node.id).toBe('hero-section')
  })

  it('loads the document collection and switches to another document', async () => {
    mockFetch()
    const editor = useAdminEditor(makeElements())
    await editor.loadDocuments()
    expect(editor.documents.value.map((document) => document.slug)).toEqual([
      'studio-page',
      'about',
    ])
    await editor.loadDocument('about')
    expect(editor.store.document.slug).toBe('about')
    expect(editor.store.document.title).toBe('About')
    expect(editor.statusMessage.value).toBe('Ready')
  })

  it('saves through the collection envelope (slug + document)', async () => {
    const bodies: unknown[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const path = url.split('?')[0]!
        if (path === '/__jlz-admin/documents')
          return { ok: true, json: async () => ({ version: 1, documents: [] }) } as Response
        if (path === '/__jlz-admin/document')
          return { ok: true, json: async () => DEFAULT_BUILDER_DOCUMENT } as Response
        if (path === '/__jlz-admin/save') {
          bodies.push(JSON.parse(String(init?.body)))
          return {
            ok: true,
            json: async () => ({
              ok: true,
              slug: 'studio-page',
              cssBytes: 123,
              components: ['grid'],
            }),
          } as Response
        }
        return { ok: true, json: async () => ({ ok: true }) } as Response
      }),
    )
    const editor = useAdminEditor(makeElements())
    await editor.loadDocument()
    await editor.saveDocument()
    const body = bodies[0]! as { slug?: string; document?: { slug?: string } }
    expect(body.slug).toBe('studio-page')
    expect(body.document?.slug).toBe('studio-page')
    expect(editor.statusMessage.value).toContain('Saved')
  })

  it('creates a new document from the next available slug', async () => {
    mockFetch()
    const editor = useAdminEditor(makeElements())
    await editor.loadDocuments()
    await editor.loadDocument()
    editor.onNewDocument()
    expect(editor.store.document.slug).toBe('page')
    expect(editor.store.document.title).toBe('Untitled page')
    expect(editor.statusMessage.value).toContain('page')
    // the current (unsaved) document appears in the select options
    expect(editor.documentOptions.value.map((option) => option.slug)).toContain('page')
  })
})

describe('AdminApp.vue', () => {
  const mountApp = async (): Promise<ReturnType<typeof mount>> => {
    mockFetch()
    const wrapper = mount(AdminApp, { attachTo: document.body })
    await flushPromises()
    return wrapper
  }

  it('renders the catalogue, the outline and the ready status', async () => {
    const wrapper = await mountApp()
    expect(wrapper.find('#save-status').text()).toBe('Ready')
    // The catalogue renders every element type as one glyph row.
    expect(wrapper.findAll('#element-catalog [data-add-element]')).toHaveLength(12)
    // The outline renders every node of the default document.
    const outlineButtons = wrapper.findAll('#document-outline [data-select-node]')
    expect(outlineButtons.length).toBeGreaterThanOrEqual(8)
    expect(wrapper.find('#builder-preview').exists()).toBe(true)
    // Phase 9: the builder preview renders the default document through the
    // trusted Vue element registry — real DOM nodes with the editor
    // delegation attributes (editable mode), not a v-html string.
    expect(wrapper.find('#builder-preview [data-builder-id="hero-section"]').exists()).toBe(true)
    expect(wrapper.find('#builder-preview .jlz-builder-section').exists()).toBe(true)
    document.body.innerHTML = ''
  })

  it('renders the document collection controls in the toolbar', async () => {
    const wrapper = await mountApp()
    // Phase 9, slice 3: the one-page restriction is gone — the toolbar hosts
    // the slug input, the document select and the New / Delete actions.
    expect(wrapper.find('#document-slug').exists()).toBe(true)
    expect(wrapper.find('#document-list').exists()).toBe(true)
    expect(wrapper.findAll('#document-list option').length).toBeGreaterThanOrEqual(1)
    expect(wrapper.find('#new-document').exists()).toBe(true)
    expect(wrapper.find('#delete-document').exists()).toBe(true)
    document.body.innerHTML = ''
  })

  it('exposes and toggles the shared preview locale', async () => {
    const wrapper = mount(AdminApp, { attachTo: document.body })
    await flushPromises()
    const localeButton = wrapper.get('.jlz-admin-locale')
    expect(localeButton.text()).toMatch(/^(EN|RU)$/)
    const before = localeButton.text()
    await localeButton.trigger('click')
    await nextTick()
    expect(localeButton.text()).not.toBe(before)
    expect(localeButton.text()).toMatch(/^(EN|RU)$/)
    wrapper.unmount()
  })

  it('adds a node when a catalogue row is clicked', async () => {
    const wrapper = await mountApp()
    const before = wrapper.findAll('#document-outline [data-select-node]').length
    await wrapper.find('[data-add-element="divider"]').trigger('click')
    await flushPromises()
    const after = wrapper.findAll('#document-outline [data-select-node]').length
    expect(after).toBe(before + 1)
    expect(wrapper.find('#save-status').text()).toBe('Unsaved changes')
    document.body.innerHTML = ''
  })

  it('switches to the Style mode and renders the style workspace', async () => {
    const wrapper = await mountApp()
    await wrapper.find('[data-mode="style"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('#style-panel').isVisible()).toBe(true)
    expect(wrapper.find('#style-navigation [data-style-group="global"]').exists()).toBe(true)
    expect(wrapper.find('#builder-preview').html()).toContain('data-style-sample="global"')
    document.body.innerHTML = ''
  })
})
