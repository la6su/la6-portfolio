// Top-level destinations rendered by NavMenu.vue.
interface NavItemData {
  num: string
  label: string
  labelKey: string
  href: string
}

export const NAV_ITEMS: readonly NavItemData[] = [
  { num: '01', label: 'Studio', labelKey: 'nav.studio', href: '/' },
  { num: '02', label: 'Services', labelKey: 'nav.services', href: '/services' },
  { num: '03', label: 'Works', labelKey: 'nav.works', href: '/works' },
  { num: '04', label: 'Manifesto', labelKey: 'nav.manifesto', href: '/manifesto' },
  { num: '05', label: 'Lab', labelKey: 'nav.lab', href: '/lab' },
  { num: '06', label: 'Blog', labelKey: 'nav.blog', href: '/blog' },
  { num: '07', label: 'Contact', labelKey: 'nav.contact', href: '/contact' },
]
