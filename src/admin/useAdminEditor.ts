// src/admin/useAdminEditor.ts — Phase 4 admin editor core as a Vue composable.
//
// This is the framework-facing half of the SFC migration: every piece of the
// admin entry's editor logic (the store swap, the mode/viewport/selection
// state, the save/load contract, the status and shortcut handling) lives here
// as a plain composable. The AdminApp.vue SFC binds the returned refs and
// calls the returned handlers; the imperative admin entry keeps existing only
// as the mount point.
//
// The BuilderStore is a plain (non-reactive) class, so the composable owns a
// `rev` counter: every action that replaces or mutates the document bumps it,
// and the panel computeds read it, so the templates repaint exactly when the
// legacy `renderEditor()` ran. The DOM side is injected as element getters
// (plus a small effects bundle) so the composable stays unit-testable in
// jsdom and a future lifecycle-safe preview can share one implementation.
//
// UIkit hydration (dynamic `uk-icon` attributes), the preview theme variables
// and the scroll-into-view helpers are the only browser-DOM effects; they run
// in `nextTick` so the template has painted first.

import {
  computed,
  getCurrentInstance,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
  type Ref,
} from 'vue'
import UIkit from 'uikit'

import { eventBus } from '../core/EventBus'
import { getLang, type Lang } from '../core/i18n'
import { prefersReducedMotion } from '../core/motionPolicy'
import * as editorCommands from '../builder/commands'
import { BUILDER_CATALOG, BUILDER_CATALOG_GROUPS } from '../builder/catalog'
import { DEFAULT_BUILDER_DOCUMENT } from '../builder/default-document'
import { STYLE_GROUPS, type BuilderThemeKey, type StyleGroupId } from '../builder/style'
import { renderStyleShowcase } from '../builder/style-showcase'
import { themeToCssVars } from '../builder/themeVariables'
import {
  validateBuilderDocument,
  type BuilderDocument,
  type BuilderElementType,
  type BuilderNode,
} from '../builder/schema'
import {
  createBuilderDocument,
  isSafeBuilderSlug,
  nextAvailableBuilderSlug,
  validateBuilderDocuments,
} from '../builder/documents'
import { BuilderStore } from '../builder/store'

type EditorMode = 'builder' | 'style'
type Viewport = 'desktop' | 'tablet' | 'mobile'

/** The browser-DOM effects the composable may run (injected for tests). */
interface AdminDomEffects {
  updateIcons?: (root: Element) => void
  setProperty?: (element: HTMLElement, name: string, value: string) => void
  toggleClass?: (element: HTMLElement, name: string, on: boolean) => void
  scrollIntoView?: (element: HTMLElement, options?: ScrollIntoViewOptions) => void
}

export interface AdminEditorElements {
  /** `#builder-preview` — the rendered page / style showcase host. */
  preview: Ref<HTMLElement | null>
  /** The right panel field host (input delegation root). */
  inspectorFields: Ref<HTMLElement | null>
  /** `#inspector-title` — the element / group name host. */
  inspectorTitle: Ref<HTMLElement | null>
  /** `#save-status` — the status output. */
  saveStatus: Ref<HTMLElement | null>
  /** `#document-title` — the toolbar title input. */
  titleInput: Ref<HTMLElement | null>
  /** `#document-slug` — the toolbar slug input. */
  slugInput: Ref<HTMLElement | null>
  /** `#document-description` — the toolbar SEO description input. */
  descriptionInput: Ref<HTMLElement | null>
  /** `#document-published` — the toolbar publish (approved) checkbox. */
  publishedCheckbox: Ref<HTMLElement | null>
  /** `#document-list` — the toolbar document select. */
  documentSelect: Ref<HTMLElement | null>
  /** `#save` — the save button. */
  saveButton: Ref<HTMLButtonElement | null>
  /** `#undo` — the undo button. */
  undoButton: Ref<HTMLButtonElement | null>
  /** `#redo` — the redo button. */
  redoButton: Ref<HTMLButtonElement | null>
}

const defaultEffects: AdminDomEffects = {
  updateIcons: (root) => (UIkit as unknown as { update(element: Element): void }).update(root),
  setProperty: (element, name, value) => element.style.setProperty(name, value),
  toggleClass: (element, name, on) => element.classList.toggle(name, on),
  scrollIntoView: (element, options) => element.scrollIntoView(options),
}

const isFormControl = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null
  if (!element) return false
  const tag = element.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable
}

const reducedMotion = prefersReducedMotion

export function useAdminEditor(
  elements: AdminEditorElements,
  effects: AdminDomEffects = defaultEffects,
) {
  // The builder state (document, selection, history, saved baseline) is the
  // typed BuilderStore — a single framework-neutral source of truth. The
  // composable only renders it and dispatches actions; the atomic
  // commit/snapshot/restore logic lives in the store.
  const store = new BuilderStore(DEFAULT_BUILDER_DOCUMENT)
  // The store is a plain class, so the panel computeds read this revision
  // counter to know when the document (or the selection) has changed.
  const rev = ref(0)
  const bump = (): void => {
    rev.value += 1
  }

  // Editor-only UI state (not part of the builder document): the active mode,
  // the selected style group, the inverse preview tone and the viewport.
  const mode = ref<EditorMode>('builder')
  const selectedStyleGroup = ref<StyleGroupId>('global')
  const inverseStylePreview = ref(false)
  const viewport = ref<Viewport>('desktop')
  const locale = ref<Lang>(getLang())
  const saving = ref(false)
  const statusMessage = ref('Loading…')
  const statusError = ref(false)
  const outlineScrollTarget = ref<string | null>(null)
  const draggedNodeId = ref<string | null>(null)
  const dropTargetId = ref<string | null>(null)
  const outlineHost = ref<HTMLElement | null>(null)
  // The document collection (Phase 9, slice 3): the saved documents and the
  // slug the loaded document came from (the slug-focusout revert target).
  const documents = ref<Array<{ slug: string; title: string }>>([])
  const loadedSlug = ref(DEFAULT_BUILDER_DOCUMENT.slug)

  // The complete `--builder-*` variable map is owned by the pure
  // themeVariables contract (single source, locked by tests); the editor only
  // assigns the result onto the preview element.
  const applyPreviewTheme = (theme: BuilderDocument['theme']): void => {
    const preview = elements.preview.value
    if (!preview) return
    for (const [name, value] of Object.entries(themeToCssVars(theme))) {
      effects.setProperty?.(preview, name, value)
    }
    effects.toggleClass?.(
      preview,
      'is-inverse-preview',
      mode.value === 'style' && inverseStylePreview.value,
    )
  }

  const setStatus = (message: string, error = false): void => {
    statusMessage.value = message
    statusError.value = error
    const status = elements.saveStatus.value
    if (status) {
      status.dataset.state = error ? 'error' : 'note'
      status.classList.toggle('is-error', error)
    }
  }

  const updateDirtyStatus = (announce = true): void => {
    const dirty = store.isDirty()
    if (announce && dirty) setStatus('Unsaved changes')
    else if (announce && statusMessage.value === 'Unsaved changes') setStatus('Ready')
    // The dirty/ready dot must not overwrite an error state.
    if (!statusError.value) {
      const status = elements.saveStatus.value
      if (status) status.dataset.state = dirty ? 'dirty' : 'ready'
    }
    const saveButton = elements.saveButton.value
    const undoButton = elements.undoButton.value
    const redoButton = elements.redoButton.value
    if (saveButton) saveButton.disabled = saving.value || !dirty
    if (undoButton) undoButton.disabled = !store.canUndo
    if (redoButton) redoButton.disabled = !store.canRedo
  }

  // Re-apply the preview DOM effects the template does not own: the
  // `--builder-*` theme variables and the `is-selected` class on the rendered
  // node (a `v-html` swap wipes child classes; a theme-only change does not
  // alter the preview string at all).
  const applyPreviewState = (): void => {
    const preview = elements.preview.value
    if (!preview) return
    applyPreviewTheme(store.document.theme)
    const selectedId = store.selectedId
    if (selectedId) {
      const element = preview.querySelector<HTMLElement>(
        `[data-builder-id="${CSS.escape(selectedId)}"]`,
      )
      if (element) effects.toggleClass?.(element, 'is-selected', true)
    }
  }

  // Refresh the panels after a store action, exactly when the legacy
  // `renderEditor()` ran: bump the revision so the templates repaint from the
  // store, then re-apply the preview state, the UIkit hydration pass and the
  // status / dirty dot update.
  const refreshPanels = (): void => {
    bump()
    void nextTick(() => {
      applyPreviewState()
      for (const root of [elements.preview.value, elements.inspectorFields.value]) {
        if (root) effects.updateIcons?.(root)
      }
      updateDirtyStatus()
    })
  }

  const recordCurrentSnapshot = (rerender = true): void => {
    const result = store.recordSnapshot()
    if (!result.ok) {
      setStatus(result.error ?? 'Invalid document change', true)
      return
    }
    if (rerender) refreshPanels()
    else updateDirtyStatus()
  }

  const restoreHistory = (nextIndex: number): void => {
    store.restore(nextIndex)
    refreshPanels()
  }

  // ── Structural commands (pure, src/builder/commands.ts) ─────────────────
  const runCommand = (result: { ok: boolean; error?: string }): void => {
    if (!result.ok) {
      setStatus(result.error ?? 'Invalid document change', true)
      return
    }
    refreshPanels()
  }

  const addElement = (type: BuilderElementType): void => {
    runCommand(editorCommands.addElement(store, type))
  }
  const moveSelected = (offset: -1 | 1): void => {
    runCommand(editorCommands.moveSelected(store, offset))
  }
  const duplicateSelected = (): void => {
    runCommand(editorCommands.duplicateSelected(store))
  }
  const removeSelected = (): void => {
    runCommand(editorCommands.removeSelected(store))
  }
  // Undo-able: the reset is a plain document commit, so history keeps it.
  const resetTheme = (): void => {
    runCommand(editorCommands.resetTheme(store))
  }

  const selectNode = (id: string | null): void => {
    store.selectedId = id
    outlineScrollTarget.value = id
    refreshPanels()
    if (id) void scrollPreviewNodeIntoView(id)
  }

  const onNodeDragStart = (id: string, event: DragEvent): void => {
    draggedNodeId.value = id
    dropTargetId.value = null
    event.dataTransfer?.setData('text/plain', id)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  }

  const onNodeDragOver = (id: string, event: DragEvent): void => {
    const source = draggedNodeId.value ? store.findNode(draggedNodeId.value) : null
    const target = store.findNode(id)
    if (!source || !target || source.siblings !== target.siblings || source.node.id === id) {
      dropTargetId.value = null
      return
    }
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    dropTargetId.value = id
  }

  const onNodeDrop = (id: string, event: DragEvent): void => {
    event.preventDefault()
    const source = draggedNodeId.value
    if (source) runCommand(editorCommands.moveNodeBefore(store, source, id))
    draggedNodeId.value = null
    dropTargetId.value = null
  }

  const onNodeDragEnd = (): void => {
    draggedNodeId.value = null
    dropTargetId.value = null
  }

  // Bring the just-selected element into view inside the preview frame;
  // reduced-motion readers get an instant jump instead of a smooth scroll.
  const scrollPreviewNodeIntoView = async (id: string): Promise<void> => {
    if (mode.value !== 'builder') return
    await nextTick()
    const preview = elements.preview.value
    const element = preview?.querySelector<HTMLElement>(`[data-builder-id="${CSS.escape(id)}"]`)
    if (element)
      effects.scrollIntoView?.(element, {
        block: 'nearest',
        behavior: reducedMotion() ? 'auto' : 'smooth',
      })
  }

  // ── Save / load contract (atomic via the dev plugin) ─────────────────────
  const saveDocument = async (): Promise<void> => {
    if (saving.value) return
    saving.value = true
    const saveButton = elements.saveButton.value
    if (saveButton) {
      saveButton.disabled = true
      saveButton.textContent = 'Saving…'
    }
    setStatus('Compiling theme…')
    try {
      const response = await fetch('/__jlz-admin/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The collection envelope (Phase 9, slice 3): the document is
        // upserted by its slug, so several documents can be saved.
        body: JSON.stringify({ slug: store.document.slug, document: store.document }),
      })
      const result = (await response.json()) as {
        ok: boolean
        error?: string
        slug?: string
        cssBytes?: number
        components?: string[]
      }
      if (!response.ok || !result.ok) throw new Error(result.error ?? 'Save failed')
      store.markSaved()
      loadedSlug.value = store.document.slug
      await loadDocuments()
      syncDocumentSelect()
      setStatus(
        `Saved · ${result.cssBytes?.toLocaleString() ?? 0} CSS bytes · ${result.components?.length ?? 0} components`,
      )
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Save failed', true)
    } finally {
      saving.value = false
      if (saveButton) saveButton.textContent = 'Save & compile'
      updateDirtyStatus(false)
    }
  }

  const loadDocuments = async (): Promise<void> => {
    try {
      const response = await fetch('/__jlz-admin/documents')
      if (!response.ok) throw new Error('Unavailable')
      const value = (await response.json()) as unknown
      const validation = validateBuilderDocuments(value)
      if (!validation.ok || !validation.documents)
        throw new Error(validation.errors[0] ?? 'Invalid collection')
      documents.value = validation.documents.documents.map((document) => ({
        slug: document.slug,
        title: document.title,
      }))
    } catch {
      documents.value = []
    }
  }

  const loadDocument = async (slug?: string): Promise<void> => {
    try {
      const target = slug ?? loadedSlug.value
      const response = await fetch(
        target
          ? `/__jlz-admin/document?slug=${encodeURIComponent(target)}`
          : '/__jlz-admin/document',
      )
      if (!response.ok) throw new Error('Saved document is unavailable')
      const candidate: unknown = await response.json()
      const validation = validateBuilderDocument(candidate)
      if (!validation.ok || !validation.document)
        throw new Error(validation.errors[0] ?? 'Saved document is invalid')
      store.load(validation.document)
      loadedSlug.value = validation.document.slug
      syncDocumentSelect()
      setStatus('Ready')
    } catch (error) {
      store.load(DEFAULT_BUILDER_DOCUMENT)
      setStatus(
        error instanceof Error ? `${error.message}; using defaults` : 'Using defaults',
        true,
      )
    }
    refreshPanels()
  }

  // ── Document collection (Phase 9, slice 3) ──────────────────────────────
  const onSlugInput = (): void => {
    const input = elements.slugInput.value as HTMLInputElement | null
    if (!input) return
    const value = input.value.trim().toLowerCase()
    if (value) {
      store.document.slug = value
      recordCurrentSnapshot(false)
    }
  }

  const onSlugFocusout = (): void => {
    const input = elements.slugInput.value as HTMLInputElement | null
    if (!input) return
    const value = input.value.trim().toLowerCase()
    if (!isSafeBuilderSlug(value)) {
      store.document.slug = loadedSlug.value
      input.value = loadedSlug.value
      setStatus('Slug must be lowercase letters, digits and single hyphens', true)
      recordCurrentSnapshot()
      return
    }
    loadedSlug.value = value
    input.value = value
    store.document.slug = value
    syncDocumentSelect()
    recordCurrentSnapshot()
  }

  // Publish gate + SEO description (Phase 9, slice 5): the document metadata
  // that selects a document for the static `/p/<slug>` routes. An empty
  // description clears the field (the pipeline falls back to the title).
  const onPublishedToggle = (): void => {
    const input = elements.publishedCheckbox.value as HTMLInputElement | null
    if (!input) return
    store.document.published = input.checked
    recordCurrentSnapshot(false)
  }

  const onDescriptionInput = (): void => {
    const input = elements.descriptionInput.value as HTMLInputElement | null
    if (!input) return
    const value = input.value.trim()
    if (value) store.document.description = value
    else delete store.document.description
    recordCurrentSnapshot(false)
  }

  const onDescriptionFocusout = (): void => {
    onDescriptionInput()
    recordCurrentSnapshot()
  }

  const onDocumentSelectChange = (): void => {
    const select = elements.documentSelect.value as HTMLSelectElement | null
    if (!select) return
    const slug = select.value
    if (slug === store.document.slug) return
    if (store.isDirty()) {
      select.value = store.document.slug
      setStatus('Save the document before switching', true)
      return
    }
    void loadDocument(slug)
  }

  const onNewDocument = (): void => {
    if (store.isDirty()) {
      setStatus('Save the document before creating a new one', true)
      return
    }
    const slug = nextAvailableBuilderSlug([
      ...documents.value.map((document) => document.slug),
      store.document.slug,
    ])
    store.load(createBuilderDocument(slug))
    loadedSlug.value = slug
    syncDocumentSelect()
    refreshPanels()
    setStatus(`New document "${slug}" — save to keep it`)
  }

  const onDeleteDocument = async (): Promise<void> => {
    if (documents.value.length < 2) {
      setStatus('At least one document must remain', true)
      return
    }
    if (store.isDirty()) {
      setStatus('Save the document before deleting', true)
      return
    }
    const slug = store.document.slug
    try {
      const response = await fetch('/__jlz-admin/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      })
      const result = (await response.json()) as { ok: boolean; error?: string }
      if (!response.ok || !result.ok) throw new Error(result.error ?? 'Delete failed')
      await loadDocuments()
      await loadDocument(documents.value[0]?.slug)
      setStatus(`Deleted "${slug}"`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Delete failed', true)
    }
  }

  // ── Editor shortcuts ──────────────────────────────────────────────────────
  // They stay out of the way while the caret is in a form control, so text
  // fields keep their native behavior (incl. native undo/redo); Ctrl+S is the
  // only shortcut that also fires there.
  const onDocumentKeydown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase()
    const mod = event.ctrlKey || event.metaKey
    if (mod) {
      if (key === 's') {
        event.preventDefault()
        void saveDocument()
        return
      }
      if (key === 'z' && !event.shiftKey) {
        if (!isFormControl(event.target)) {
          event.preventDefault()
          if (store.canUndo) restoreHistory(store.historyIndex - 1)
        }
        return
      }
      if (key === 'z' || key === 'y') {
        if (!isFormControl(event.target)) {
          event.preventDefault()
          if (store.canRedo) restoreHistory(store.historyIndex + 1)
        }
      }
      return
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (isFormControl(event.target) || mode.value !== 'builder' || !store.selectedId) return
      event.preventDefault()
      removeSelected()
    }
  }

  const onBeforeUnload = (event: BeforeUnloadEvent): void => {
    if (!store.isDirty()) return
    event.preventDefault()
  }

  // ── Inspector field input (theme props + node props) ─────────────────────
  const onFieldInput = (event: Event): void => {
    const control = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    const themeKey = control.dataset.themeProp as BuilderThemeKey | undefined
    if (themeKey) {
      store.document.theme[themeKey] = control.value
      // Keep the hex / swatch peers in sync (the color row owns both).
      elements.inspectorFields.value
        ?.querySelectorAll<HTMLInputElement | HTMLSelectElement>(`[data-theme-prop="${themeKey}"]`)
        .forEach((peer) => {
          if (
            peer !== control &&
            (control.type === 'color' || /^#[0-9a-f]{6}$/i.test(control.value))
          )
            peer.value = control.value
        })
      applyPreviewTheme(store.document.theme)
      recordCurrentSnapshot(false)
      return
    }
    if (!store.selectedId || !control.dataset.nodeProp) return
    const location = store.findNode(store.selectedId)
    if (!location) return
    location.node.props[control.dataset.nodeProp] = control.value
    refreshPanels()
    recordCurrentSnapshot(false)
  }

  const onFieldFocusout = (): void => {
    recordCurrentSnapshot()
  }

  const onTitleInput = (): void => {
    const input = elements.titleInput.value as HTMLInputElement | null
    if (!input) return
    store.document.title = input.value.trim() || 'Untitled page'
    recordCurrentSnapshot(false)
  }

  const onTitleFocusout = (): void => {
    recordCurrentSnapshot()
  }

  const setMode = (next: EditorMode): void => {
    mode.value = next
    refreshPanels()
  }

  const setViewport = (next: Viewport): void => {
    viewport.value = next
  }

  const setStyleGroup = (group: StyleGroupId): void => {
    selectedStyleGroup.value = group
    refreshPanels()
    // The full component set always stays visible; the selected group's
    // sample is marked active and scrolled into view.
    void nextTick(() => {
      const preview = elements.preview.value
      const sample = preview?.querySelector<HTMLElement>(`[data-style-sample="${group}"]`)
      if (sample) effects.scrollIntoView?.(sample, { block: 'start', behavior: 'smooth' })
    })
  }

  const setStyleTone = (inverse: boolean): void => {
    inverseStylePreview.value = inverse
    applyPreviewTheme(store.document.theme)
  }

  // ── Reactive panels (bound by the SFC) ────────────────────────────────────
  // The builder document renders through the trusted Vue element registry
  // (BuilderPage in AdminApp.vue) — only the style showcase is still a
  // pure-HTML string here (the framework-neutral core).
  const previewHtml = computed((): string => {
    void rev.value
    return renderStyleShowcase(selectedStyleGroup.value)
  })

  const catalogGroups = BUILDER_CATALOG_GROUPS

  interface OutlineEntry {
    node: BuilderNode
    depth: number
  }
  const outline = computed((): OutlineEntry[] => {
    void rev.value
    const entries: OutlineEntry[] = []
    const walk = (nodes: BuilderNode[], depth: number): void => {
      for (const node of nodes) {
        entries.push({ node, depth })
        walk(node.children, depth + 1)
      }
    }
    walk(store.document.nodes, 0)
    return entries
  })

  const inspectorLocation = computed(() => {
    void rev.value
    return store.selectedId ? store.findNode(store.selectedId) : null
  })
  const inspectorDefinition = computed(() =>
    inspectorLocation.value ? BUILDER_CATALOG[inspectorLocation.value.node.type] : null,
  )
  const styleGroup = computed(
    () => STYLE_GROUPS.find((group) => group.id === selectedStyleGroup.value) ?? null,
  )
  const inspectorTitleText = computed((): string => {
    if (mode.value === 'style') return styleGroup.value?.label ?? 'No selection'
    return inspectorDefinition.value?.label ?? 'No selection'
  })

  // The document select options: every saved document, plus the current
  // document when it is not (yet) in the collection (an unsaved new document
  // or a freshly created one).
  const documentOptions = computed((): Array<{ slug: string; title: string }> => {
    void rev.value
    const options = [...documents.value]
    if (!options.some((option) => option.slug === store.document.slug))
      options.push({ slug: store.document.slug, title: store.document.title })
    return options
  })

  const syncDocumentSelect = (): void => {
    const select = elements.documentSelect.value as HTMLSelectElement | null
    if (!select) return
    if (documentOptions.value.some((option) => option.slug === store.document.slug))
      select.value = store.document.slug
  }

  // Re-apply the preview state and re-hydrate the dynamic `uk-icon`
  // attributes whenever a panel repaints (a `v-html` swap wipes the child
  // selection class even though the element variables survive it).
  watch([previewHtml, outline, inspectorDefinition, styleGroup, mode, selectedStyleGroup], () => {
    void nextTick(applyPreviewState)
    void nextTick(() => {
      for (const root of [elements.preview.value, elements.inspectorFields.value]) {
        if (root) effects.updateIcons?.(root)
      }
    })
  })

  // Keep the selected outline row in view without fighting the reader.
  watch(outlineScrollTarget, (id) => {
    if (!id) return
    void nextTick(() => {
      const item = outlineHost.value?.querySelector<HTMLElement>(
        `[data-select-node="${CSS.escape(id)}"]`,
      )
      if (item) effects.scrollIntoView?.(item, { block: 'nearest' })
      outlineScrollTarget.value = null
    })
  })

  // Register the document-level listeners only inside a component instance
  // (bare composable tests drive the handlers directly).
  if (getCurrentInstance()) {
    let stopLangChange: (() => void) | null = null
    onMounted(() => {
      stopLangChange = eventBus.on('jlz:lang-change', ({ lang }) => {
        locale.value = lang as Lang
        bump()
      })
      void (async () => {
        await loadDocuments()
        await loadDocument(documents.value[0]?.slug)
      })()
      document.addEventListener('keydown', onDocumentKeydown)
      window.addEventListener('beforeunload', onBeforeUnload)
    })
    onUnmounted(() => {
      stopLangChange?.()
      stopLangChange = null
      document.removeEventListener('keydown', onDocumentKeydown)
      window.removeEventListener('beforeunload', onBeforeUnload)
    })
  }

  return {
    store,
    mode,
    selectedStyleGroup,
    inverseStylePreview,
    viewport,
    locale,
    saving,
    statusMessage,
    statusError,
    previewHtml,
    catalogGroups,
    outline,
    inspectorLocation,
    inspectorDefinition,
    styleGroup,
    inspectorTitleText,
    documents,
    documentOptions,
    addElement,
    moveSelected,
    duplicateSelected,
    removeSelected,
    resetTheme,
    selectNode,
    draggedNodeId,
    dropTargetId,
    onNodeDragStart,
    onNodeDragOver,
    onNodeDrop,
    onNodeDragEnd,
    saveDocument,
    loadDocument,
    loadDocuments,
    restoreHistory,
    setMode,
    setViewport,
    setStyleGroup,
    setStyleTone,
    onFieldInput,
    onFieldFocusout,
    onTitleInput,
    onTitleFocusout,
    onSlugInput,
    onSlugFocusout,
    onPublishedToggle,
    onDescriptionInput,
    onDescriptionFocusout,
    onDocumentSelectChange,
    onNewDocument,
    onDeleteDocument,
    onDocumentKeydown,
    onBeforeUnload,
    outlineHost,
  }
}
