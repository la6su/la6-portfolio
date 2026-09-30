import type { Project } from '../core/types'

export { type Project }

/**
 * The exhibition has four permanent rooms. Their texture paths intentionally
 * point at the current licensed studio placeholders until approved project
 * renders and screenshots are delivered.
 */
export const PROJECTS: Project[] = [
  {
    id: 'porsche-911-spider',
    title: 'Porsche 911 Spider',
    description: 'A motion-led CG study of light, silhouette and a car in motion.',
    textureUrl: '/assets/projects/ebb-vibes/cover-studio-v2.jpg',
    detailTextureUrl: '/assets/projects/ebb-vibes/detail.webp',
    color: '#ff5500',
    year: '2025',
    category: 'Motion & CG',
    tags: ['CG', 'Motion direction', 'Art direction'],
    viewPosition: { x: -4, y: 0.5, z: 5 },
    viewLookAt: { x: -4, y: 0, z: 0 },
  },
  {
    id: 'alise',
    title: 'Alise',
    description: 'A CG image system where light, texture and movement form one character.',
    textureUrl: '/assets/projects/mono-sunday/cover-studio-v2.jpg',
    detailTextureUrl: '/assets/projects/mono-sunday/detail.webp',
    color: '#88cc70',
    year: '2025',
    category: 'Motion & CG',
    tags: ['CG', 'Look development', 'Motion direction'],
    viewPosition: { x: 0, y: 0.5, z: 5 },
    viewLookAt: { x: 0, y: 0, z: 0 },
  },
  {
    id: '19-lab',
    title: '19 Lab',
    description: 'A product-led web presentation for cosmetics, built around care and detail.',
    textureUrl: '/assets/projects/till-at-night/cover-studio-v2.jpg',
    detailTextureUrl: '/assets/projects/till-at-night/detail.webp',
    color: '#cc88ff',
    year: '2025',
    category: 'Product website',
    tags: ['E-commerce', 'Art direction', 'Web design'],
    viewPosition: { x: 4, y: 0.5, z: 5 },
    viewLookAt: { x: 4, y: 0, z: 0 },
  },
  {
    id: 'pro193',
    title: 'Pro193',
    description: 'An online store for tall men, centred on fit, clothing and a clear choice.',
    textureUrl: '/assets/projects/nocturne-blue/cover-studio-v2.jpg',
    detailTextureUrl: '/assets/projects/nocturne-blue/detail.webp',
    color: '#3366cc',
    year: '2025',
    category: 'E-commerce',
    tags: ['E-commerce', 'UX', 'Web design'],
    viewPosition: { x: 8, y: 0.5, z: 5 },
    viewLookAt: { x: 8, y: 0, z: 0 },
  },
]
