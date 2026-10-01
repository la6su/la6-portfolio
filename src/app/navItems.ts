// Top-level destinations rendered by NavMenu.vue.
import type { PageId } from '../core/routeManifest'

type NavItemData = {
  num: string
  label: string
  labelKey: string
} & ({ page: PageId; href?: never } | { page?: never; href: '/blog' })

export const NAV_ITEMS: readonly NavItemData[] = [
  { num: '01', label: 'Studio', labelKey: 'nav.studio', page: 'home' },
  { num: '02', label: 'Services', labelKey: 'nav.services', page: 'services' },
  { num: '03', label: 'Works', labelKey: 'nav.works', page: 'works' },
  { num: '04', label: 'Manifesto', labelKey: 'nav.manifesto', page: 'manifesto' },
  { num: '05', label: 'Lab', labelKey: 'nav.lab', page: 'lab' },
  { num: '06', label: 'Blog', labelKey: 'nav.blog', href: '/blog' },
  { num: '07', label: 'Contact', labelKey: 'nav.contact', page: 'contact' },
]
