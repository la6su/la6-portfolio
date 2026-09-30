// Vue-owned lifecycle bindings for the semantic NavMenu SFC.
//
// The menu is flat. This owner only updates the decorative preview and keeps
// the binding scoped to the active route root.

export function initMenuLifecycle(routeRoot: HTMLElement): () => void {
  const nav = routeRoot.querySelector('.jlz-menu-nav')
  const abortController = new AbortController()
  if (!nav) return () => abortController.abort()

  nav.querySelectorAll<HTMLAnchorElement>('.jlz-menu-nav__toggle').forEach((toggle) => {
    const syncPreview = (): void => {
      const previewNumber = routeRoot.querySelector<HTMLElement>('.jlz-menu-preview__number')
      const previewLabel = routeRoot.querySelector<HTMLElement>('.jlz-menu-preview__label')
      const number = toggle.querySelector<HTMLElement>('.jlz-menu-nav__num')?.textContent
      const label = toggle.querySelector<HTMLElement>('.jlz-menu-nav__label')?.textContent
      if (previewNumber && number) previewNumber.textContent = number
      if (previewLabel && label) previewLabel.textContent = label
    }
    toggle.addEventListener('pointerenter', syncPreview, { signal: abortController.signal })
    toggle.addEventListener('focus', syncPreview, { signal: abortController.signal })
  })

  return () => {
    abortController.abort()
  }
}
