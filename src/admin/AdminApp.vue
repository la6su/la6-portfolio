<script setup lang="ts">
// src/admin/AdminApp.vue — Phase 4: the admin editor as a Vue SFC.
//
// The template is a 1:1 port of `admin/index.html` (same ids and classes, so
// `admin/admin.less` keeps working untouched); the behavior is the
// `useAdminEditor` composable over the typed `BuilderStore`. The builder
// document renders through the trusted Vue element registry
// (`BuilderPage`, Phase 9); the style showcase stays a pure-HTML string
// (the builder core is pure) and the SFC hosts it via `v-html`. The editor
// affordances (selection class, theme variables, UIkit hydration) are DOM
// effects on the shared `#builder-preview` container in both modes.
import UIkit from 'uikit'
import { onMounted, onUpdated, ref } from 'vue'

import { BUILDER_CATALOG, BUILDER_CATALOG_GROUPS } from '../builder/catalog'
import { STYLE_GROUPS } from '../builder/style'
import { BuilderPage } from '../builder/vue/BuilderPage'
import { toggleLang } from '../core/i18n'
import { useAdminEditor } from './useAdminEditor'

const previewEl = ref<HTMLElement | null>(null)
const inspectorFieldsEl = ref<HTMLElement | null>(null)
const inspectorTitleEl = ref<HTMLElement | null>(null)
const saveStatusEl = ref<HTMLElement | null>(null)
const titleInputEl = ref<HTMLElement | null>(null)
const slugInputEl = ref<HTMLElement | null>(null)
const descriptionInputEl = ref<HTMLElement | null>(null)
const publishedCheckboxEl = ref<HTMLElement | null>(null)
const documentSelectEl = ref<HTMLElement | null>(null)
const saveButtonEl = ref<HTMLButtonElement | null>(null)
const undoButtonEl = ref<HTMLButtonElement | null>(null)
const redoButtonEl = ref<HTMLButtonElement | null>(null)

// Destructure the composable: the template auto-unwraps top-level refs only,
// so every binding the markup reads lives at the top level.
const {
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
  outline,
  inspectorLocation,
  inspectorDefinition,
  styleGroup,
  inspectorTitleText,
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
  outlineHost,
} = useAdminEditor({
  preview: previewEl,
  inspectorFields: inspectorFieldsEl,
  inspectorTitle: inspectorTitleEl,
  saveStatus: saveStatusEl,
  titleInput: titleInputEl,
  slugInput: slugInputEl,
  descriptionInput: descriptionInputEl,
  publishedCheckbox: publishedCheckboxEl,
  documentSelect: documentSelectEl,
  saveButton: saveButtonEl,
  undoButton: undoButtonEl,
  redoButton: redoButtonEl,
})

// The element catalog is static — one hydrated list, rendered once.
const catalog = BUILDER_CATALOG_GROUPS.map((group) => ({
  label: group.label,
  types: group.types.map((type) => ({
    type,
    label: BUILDER_CATALOG[type].label,
    icon: BUILDER_CATALOG[type].icon,
    description: BUILDER_CATALOG[type].description,
  })),
}))

// Dynamic `uk-icon` attributes need a UIkit pass to hydrate into SVG.
const hydrateCatalog = (): void => {
  const root = document.getElementById('element-catalog')
  if (root) (UIkit as unknown as { update(element: Element): void }).update(root)
}
onMounted(hydrateCatalog)
onUpdated(hydrateCatalog)

const onPreviewClick = (event: MouseEvent): void => {
  event.preventDefault()
  const element = (event.target as HTMLElement).closest<HTMLElement>('[data-builder-id]')
  if (element?.dataset.builderId) selectNode(element.dataset.builderId)
}

// The outline host is bound through a callback so the composable's ref
// (used for the scroll-into-view effect) stays the single owner.
const setOutlineHost = (el: unknown): void => {
  outlineHost.value = (el as HTMLElement | null) ?? null
}

const onPreviewKeydown = (event: KeyboardEvent): void => {
  if (event.key !== 'Enter' && event.key !== ' ') return
  const element = (event.target as HTMLElement).closest<HTMLElement>('[data-builder-id]')
  if (!element?.dataset.builderId) return
  event.preventDefault()
  selectNode(element.dataset.builderId)
}

const toggleBuilderLocale = (): void => {
  toggleLang()
}
</script>

<template>
  <div class="jlz-admin" data-jlz-admin="true">
    <header class="jlz-admin-toolbar">
      <a class="jlz-admin-brand" href="/" aria-label="Open the public site">
        <span aria-hidden="true">JLZ</span>
        <strong>Page Builder</strong>
      </a>
      <label class="jlz-admin-title">
        <span class="uk-hidden">Page title</span>
        <input
          id="document-title"
          ref="titleInputEl"
          class="uk-input"
          maxlength="120"
          :value="store.document.title"
          @input="onTitleInput"
          @focusout="onTitleFocusout"
        />
      </label>
      <label class="jlz-admin-slug">
        <span class="uk-hidden">Page slug</span>
        <input
          id="document-slug"
          ref="slugInputEl"
          class="uk-input"
          maxlength="64"
          :value="store.document.slug"
          @input="onSlugInput"
          @focusout="onSlugFocusout"
        />
      </label>
      <div class="jlz-admin-documents" aria-label="Document collection">
        <select
          id="document-list"
          ref="documentSelectEl"
          class="uk-select uk-form-small"
          aria-label="Builder documents"
          @change="onDocumentSelectChange"
        >
          <option v-for="document in documentOptions" :key="document.slug" :value="document.slug">
            {{ document.slug }}
          </option>
        </select>
        <button
          id="new-document"
          class="uk-button uk-button-default uk-button-small"
          type="button"
          title="Create a new document"
          @click="onNewDocument"
        >
          New
        </button>
        <button
          id="delete-document"
          class="uk-button uk-button-default uk-button-small"
          type="button"
          title="Delete the current document"
          @click="onDeleteDocument"
        >
          Delete
        </button>
        <label
          class="jlz-admin-published"
          title="Approve the document for the static /p/&lt;slug&gt; route"
        >
          <input
            id="document-published"
            ref="publishedCheckboxEl"
            type="checkbox"
            :checked="store.document.published === true"
            @change="onPublishedToggle"
          />
          Publish
        </label>
        <label class="jlz-admin-description">
          <span class="uk-hidden">SEO description</span>
          <input
            id="document-description"
            ref="descriptionInputEl"
            class="uk-input"
            maxlength="300"
            placeholder="SEO description"
            :value="store.document.description ?? ''"
            @input="onDescriptionInput"
            @focusout="onDescriptionFocusout"
          />
        </label>
      </div>
      <div class="jlz-admin-history" aria-label="History controls">
        <button
          id="undo"
          ref="undoButtonEl"
          class="uk-button uk-button-default uk-button-small"
          type="button"
          title="Undo (Ctrl+Z)"
          @click="restoreHistory(store.historyIndex - 1)"
        >
          Undo
        </button>
        <button
          id="redo"
          ref="redoButtonEl"
          class="uk-button uk-button-default uk-button-small"
          type="button"
          title="Redo (Ctrl+Shift+Z)"
          @click="restoreHistory(store.historyIndex + 1)"
        >
          Redo
        </button>
      </div>
      <button
        class="jlz-admin-locale"
        type="button"
        :aria-label="`Preview language: ${locale}. Switch language`"
        :title="`Preview language: ${locale}`"
        @click="toggleBuilderLocale"
      >
        {{ locale }}
      </button>
      <div class="jlz-admin-viewports" role="group" aria-label="Preview width">
        <button
          :class="{ 'is-active': viewport === 'desktop' }"
          data-viewport="desktop"
          type="button"
          title="Preview width: full"
          @click="setViewport('desktop')"
        >
          Desktop
        </button>
        <button
          :class="{ 'is-active': viewport === 'tablet' }"
          data-viewport="tablet"
          type="button"
          title="Preview width: 820px"
          @click="setViewport('tablet')"
        >
          Tablet
        </button>
        <button
          :class="{ 'is-active': viewport === 'mobile' }"
          data-viewport="mobile"
          type="button"
          title="Preview width: 390px"
          @click="setViewport('mobile')"
        >
          Mobile
        </button>
      </div>
      <output
        id="save-status"
        ref="saveStatusEl"
        class="jlz-admin-status"
        aria-live="polite"
        :data-state="statusError ? 'error' : 'note'"
        :class="{ 'is-error': statusError }"
      >
        {{ statusMessage }}
      </output>
      <button
        id="save"
        ref="saveButtonEl"
        class="uk-button uk-button-primary"
        type="button"
        title="Save &amp; compile (Ctrl+S)"
        @click="saveDocument()"
      >
        {{ saving ? 'Saving…' : 'Save &amp; compile' }}
      </button>
    </header>

    <aside class="jlz-admin-sidebar jlz-admin-sidebar-left" aria-label="Builder navigation">
      <nav class="jlz-admin-tabs" aria-label="Editor mode">
        <button
          :class="{ 'is-active': mode === 'builder' }"
          data-mode="builder"
          type="button"
          @click="setMode('builder')"
        >
          Builder
        </button>
        <button
          :class="{ 'is-active': mode === 'style' }"
          data-mode="style"
          type="button"
          @click="setMode('style')"
        >
          Style
        </button>
      </nav>

      <div v-show="mode === 'builder'" id="builder-panel">
        <div class="jlz-admin-panel-heading">
          <div>
            <span class="jlz-admin-kicker">Elements</span>
            <h1>Add content</h1>
          </div>
        </div>
        <div id="element-catalog" class="jlz-admin-catalog">
          <template v-for="group in catalog" :key="group.label">
            <span class="jlz-admin-catalog-group">{{ group.label }}</span>
            <button
              v-for="entry in group.types"
              :key="entry.type"
              type="button"
              :data-add-element="entry.type"
              :title="entry.description"
              @click="addElement(entry.type)"
            >
              <span
                class="jlz-admin-element-icon"
                :uk-icon="`icon: ${entry.icon}; ratio: 1.1`"
                aria-hidden="true"
              ></span>
              <span>{{ entry.label }}</span>
            </button>
          </template>
        </div>
        <div class="jlz-admin-outline-heading">
          <span class="jlz-admin-kicker">Document</span>
          <strong>Outline</strong>
        </div>
        <ol :ref="setOutlineHost" id="document-outline" class="jlz-admin-outline">
          <li
            v-for="entry in outline"
            :key="entry.node.id"
            draggable="true"
            :class="{
              'is-dragging': entry.node.id === draggedNodeId,
              'is-drop-target': entry.node.id === dropTargetId,
            }"
            @dragstart="onNodeDragStart(entry.node.id, $event)"
            @dragover="onNodeDragOver(entry.node.id, $event)"
            @drop="onNodeDrop(entry.node.id, $event)"
            @dragend="onNodeDragEnd()"
          >
            <button
              type="button"
              :data-select-node="entry.node.id"
              :class="{ 'is-selected': entry.node.id === store.selectedId }"
              :title="BUILDER_CATALOG[entry.node.type].description"
              :style="{ '--depth': entry.depth }"
              @click="selectNode(entry.node.id)"
            >
              <span
                class="jlz-admin-outline-icon"
                :uk-icon="`icon: ${BUILDER_CATALOG[entry.node.type].icon}; ratio: 1.1`"
                aria-hidden="true"
              ></span>
              <span>
                {{
                  entry.node.props.content?.slice(0, 32) ||
                  entry.node.props.label?.slice(0, 32) ||
                  BUILDER_CATALOG[entry.node.type].label
                }}
              </span>
            </button>
          </li>
        </ol>
      </div>

      <div v-show="mode === 'style'" id="style-panel">
        <div class="jlz-admin-panel-heading">
          <div>
            <span class="jlz-admin-kicker">UIkit Styler</span>
            <h1>Custom theme</h1>
          </div>
          <button
            id="theme-reset"
            class="uk-button uk-button-text uk-button-small"
            type="button"
            title="Reset all theme values to the JUSTLOVEJAZZ defaults (undo-able)"
            @click="resetTheme()"
          >
            Reset
          </button>
        </div>
        <p class="jlz-admin-help">
          Edit whitelisted UIkit/Less decisions and compile them into the JUSTLOVEJAZZ theme.
        </p>
        <nav id="style-navigation" class="jlz-admin-style-navigation" aria-label="Style groups">
          <template v-for="category in ['general', 'component']" :key="category">
            <span class="jlz-admin-style-category">
              {{ category === 'general' ? 'General' : 'Components' }}
            </span>
            <button
              v-for="group in STYLE_GROUPS.filter((candidate) => candidate.category === category)"
              :key="group.id"
              type="button"
              :data-style-group="group.id"
              :class="{ 'is-selected': selectedStyleGroup === group.id }"
              @click="setStyleGroup(group.id)"
            >
              <span :uk-icon="`icon: ${group.icon}; ratio: 1.1`" aria-hidden="true"></span>
              <span class="jlz-admin-style-label">{{ group.label }}</span>
              <span class="jlz-admin-style-count">{{ group.fields.length }}</span>
            </button>
          </template>
        </nav>
      </div>
    </aside>

    <main class="jlz-admin-stage" aria-label="Page preview">
      <div class="jlz-admin-stage-meta">
        <span id="preview-label">Live preview · {{ viewport }}</span>
        <div class="jlz-admin-preview-meta-actions">
          <div
            id="style-tone-controls"
            v-show="mode === 'style'"
            class="jlz-admin-tone-controls"
            role="group"
            aria-label="Style polarity"
          >
            <button
              :class="{ 'is-active': !inverseStylePreview }"
              data-style-tone="default"
              type="button"
              @click="setStyleTone(false)"
            >
              Default
            </button>
            <button
              :class="{ 'is-active': inverseStylePreview }"
              data-style-tone="inverse"
              type="button"
              @click="setStyleTone(true)"
            >
              Inverse
            </button>
          </div>
          <span>UIkit 3 / custom theme</span>
        </div>
      </div>
      <div :data-viewport="viewport" class="jlz-admin-preview-frame">
        <div
          ref="previewEl"
          id="builder-preview"
          class="jlz-builder-preview"
          @click="onPreviewClick"
          @keydown="onPreviewKeydown"
        >
          <!-- Builder mode: the trusted Vue element registry (Phase 9) —
               real DOM nodes with the delegation attributes. -->
          <BuilderPage
            v-if="mode === 'builder'"
            :document="store.document"
            :locale="locale"
            editable
          />
          <!-- Style mode: the generated showcase (pure-HTML string). -->
          <div v-else v-html="previewHtml"></div>
        </div>
      </div>
    </main>

    <aside class="jlz-admin-sidebar jlz-admin-sidebar-right" aria-label="Element inspector">
      <div class="jlz-admin-panel-heading">
        <div>
          <span class="jlz-admin-kicker">Inspector</span>
          <h2 id="inspector-title" ref="inspectorTitleEl">{{ inspectorTitleText }}</h2>
          <code v-if="mode === 'style' && styleGroup" class="jlz-admin-inspector-id">
            {{ styleGroup.id }}
          </code>
          <code v-else-if="mode === 'builder' && inspectorLocation" class="jlz-admin-inspector-id">
            {{ inspectorLocation.node.id }}
          </code>
        </div>
        <div
          class="jlz-admin-node-actions"
          id="node-actions"
          v-show="mode === 'builder' && inspectorLocation"
        >
          <button
            id="move-up"
            type="button"
            title="Move element up"
            aria-label="Move element up"
            @click="moveSelected(-1)"
          >
            ↑
          </button>
          <button
            id="move-down"
            type="button"
            title="Move element down"
            aria-label="Move element down"
            @click="moveSelected(1)"
          >
            ↓
          </button>
          <button
            id="duplicate"
            type="button"
            title="Duplicate element"
            aria-label="Duplicate element"
            @click="duplicateSelected()"
          >
            ⧉
          </button>
          <button
            id="remove"
            type="button"
            title="Remove element (Del)"
            aria-label="Remove element"
            @click="removeSelected()"
          >
            ×
          </button>
        </div>
      </div>

      <!-- The key remounts the field set on selection / history changes so
           the inputs always start from the store's values. -->
      <div
        ref="inspectorFieldsEl"
        id="inspector-fields"
        class="jlz-admin-inspector-fields"
        :key="`inspector-${mode}-${inspectorLocation?.node.id ?? 'none'}-${selectedStyleGroup}-${store.historyIndex}`"
        @input="onFieldInput"
        @focusout="onFieldFocusout"
      >
        <template v-if="mode === 'style' && styleGroup">
          <p class="jlz-admin-inspector-description">{{ styleGroup.description }}</p>
          <template
            v-for="section in [
              { label: 'Colors', type: 'color' },
              { label: 'Values', type: 'select' },
            ]"
            :key="section.type"
          >
            <section
              v-if="styleGroup?.fields.some((field) => field.type === section.type)"
              class="jlz-admin-inspector-group"
            >
              <header class="jlz-admin-inspector-group-label">{{ section.label }}</header>
              <label
                v-for="field in styleGroup?.fields.filter((f) => f.type === section.type)"
                :key="field.key"
                class="jlz-admin-field"
                :class="{ 'jlz-admin-field-color': field.type === 'color' }"
              >
                <span :data-description="field.description">{{ field.label }}</span>
                <template v-if="field.type === 'color'">
                  <input
                    class="jlz-admin-hex"
                    type="text"
                    pattern="#[0-9a-fA-F]{6}"
                    spellcheck="false"
                    autocomplete="off"
                    :data-theme-prop="field.key"
                    :value="store.document.theme[field.key]"
                  />
                  <input
                    class="jlz-admin-swatch"
                    type="color"
                    :data-theme-prop="field.key"
                    :value="store.document.theme[field.key]"
                  />
                </template>
                <select
                  v-else
                  class="uk-select"
                  :data-theme-prop="field.key"
                  :value="store.document.theme[field.key]"
                >
                  <option
                    v-for="option in field.options ?? []"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>
                <small v-if="field.description" class="jlz-admin-sr-only">{{
                  field.description
                }}</small>
              </label>
            </section>
          </template>
        </template>
        <template v-else-if="mode === 'builder' && inspectorLocation && inspectorDefinition">
          <section
            v-for="group in inspectorDefinition?.fieldGroups ?? []"
            :key="group.label"
            class="jlz-admin-inspector-group"
          >
            <header class="jlz-admin-inspector-group-label">{{ group.label }}</header>
            <label
              v-for="field in group.fields"
              :key="field.key"
              class="jlz-admin-field"
              :class="{ 'jlz-admin-field--stacked': field.type === 'textarea' }"
            >
              <span>{{ field.label }}</span>
              <textarea
                v-if="field.type === 'textarea'"
                class="uk-textarea"
                :name="field.key"
                :data-node-prop="field.key"
                :value="inspectorLocation?.node.props[field.key] ?? ''"
              ></textarea>
              <select
                v-else-if="field.type === 'select'"
                class="uk-select"
                :name="field.key"
                :data-node-prop="field.key"
                :value="inspectorLocation?.node.props[field.key] ?? ''"
              >
                <option
                  v-for="option in field.options ?? []"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
              <input
                v-else
                class="uk-input"
                :type="field.type === 'url' ? 'url' : 'text'"
                :name="field.key"
                :data-node-prop="field.key"
                :value="inspectorLocation?.node.props[field.key] ?? ''"
              />
            </label>
          </section>
        </template>
        <p v-else class="jlz-admin-help">Select an element in the outline or preview to edit it.</p>
      </div>
    </aside>
  </div>
</template>
