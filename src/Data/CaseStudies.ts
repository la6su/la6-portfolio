import type { CaseStudy } from '../core/caseStudies'

/** Public case notes. Keep claims factual until approved project evidence arrives. */
export const CASE_STUDIES: readonly CaseStudy[] = [
  {
    projectId: 'porsche-911-spider',
    disclosure: 'client',
    outcome:
      'A motion and CG treatment that puts the Porsche 911 Spider at the centre of the frame.',
    context:
      'The work explores how light, silhouette and camera movement can make the vehicle feel present.',
    problem: 'The image needed a clear hero without flattening the form into a product cutout.',
    role: 'Art direction, motion direction and CG development.',
    constraints: ['Hero silhouette', 'Controlled lighting', 'Focused pacing'],
    response:
      'A restrained visual system lets the bodywork, reflections and movement carry the story.',
    stack: ['CG', 'Motion direction', 'Art direction'],
    result: 'A focused presentation designed to hold attention on the car and its character.',
    proof: [
      {
        label: 'Project material',
        value: 'Selected material is being prepared',
        source: 'studio review',
      },
    ],
    media: [
      {
        src: '/assets/projects/ebb-vibes/detail.webp',
        alt: 'Temporary abstract project material for Porsche 911 Spider',
        width: 1600,
        height: 900,
        kind: 'image',
        caption: 'Temporary presentation material',
      },
    ],
    ctaLabel: 'Discuss a similar project',
  },
  {
    projectId: 'alise',
    disclosure: 'client',
    outcome: 'A CG-led visual language built from form, texture and light.',
    context: 'Alise needed an image system with one clear mood across still and moving material.',
    problem: 'Separate visual experiments needed to become one recognisable whole.',
    role: 'Art direction, look development and motion direction.',
    constraints: ['One visual character', 'Tactile materials', 'Measured motion'],
    response:
      'Light and surface treatment establish a consistent image before movement adds emphasis.',
    stack: ['CG', 'Look development', 'Motion direction'],
    result: 'A concise visual language that can grow across project material.',
    proof: [
      {
        label: 'Project material',
        value: 'Selected material is being prepared',
        source: 'studio review',
      },
    ],
    media: [
      {
        src: '/assets/projects/mono-sunday/detail.webp',
        alt: 'Temporary abstract project material for Alise',
        width: 1600,
        height: 900,
        kind: 'image',
        caption: 'Temporary presentation material',
      },
    ],
    ctaLabel: 'Discuss a similar project',
  },
  {
    projectId: '19-lab',
    disclosure: 'client',
    outcome:
      'A product website for cosmetics that makes care, detail and brand character easy to read.',
    context:
      'The presentation needed to introduce product information without losing a calm, tactile feeling.',
    problem:
      'Dense product detail can quickly make a beauty catalogue feel generic or difficult to scan.',
    role: 'Art direction, web design and creative development.',
    constraints: ['Clear product hierarchy', 'Responsive layout', 'Quiet visual language'],
    response:
      'A simple content system gives the product, its use and the brand enough room to be understood.',
    stack: ['Web design', 'Vue', 'Art direction'],
    result: 'A product-focused experience prepared to support a growing cosmetics range.',
    proof: [
      {
        label: 'Project material',
        value: 'Selected material is being prepared',
        source: 'studio review',
      },
    ],
    media: [
      {
        src: '/assets/projects/till-at-night/detail.webp',
        alt: 'Temporary abstract project material for 19 Lab',
        width: 1600,
        height: 900,
        kind: 'image',
        caption: 'Temporary presentation material',
      },
    ],
    ctaLabel: 'Discuss a similar project',
  },
  {
    projectId: 'pro193',
    disclosure: 'client',
    outcome:
      'An e-commerce experience for tall men, centred on fit, clothing and confident choice.',
    context:
      'Pro193 needed a store that explains a specific product need while keeping shopping direct.',
    problem:
      'Sizing and fit information had to help customers choose without slowing the path to a product.',
    role: 'Product design, web design and creative development.',
    constraints: ['Fit-first information', 'Clear navigation', 'Responsive shopping flow'],
    response: 'The content puts clothing and fit guidance ahead of interface decoration.',
    stack: ['E-commerce', 'UX', 'Web design'],
    result: 'A clear product route for a specialised clothing audience.',
    proof: [
      {
        label: 'Project material',
        value: 'Selected material is being prepared',
        source: 'studio review',
      },
    ],
    media: [
      {
        src: '/assets/projects/nocturne-blue/detail.webp',
        alt: 'Temporary abstract project material for Pro193',
        width: 1600,
        height: 900,
        kind: 'image',
        caption: 'Temporary presentation material',
      },
    ],
    ctaLabel: 'Discuss a similar project',
  },
]

export const CASE_STUDY_BY_PROJECT = new Map(
  CASE_STUDIES.map((caseStudy) => [caseStudy.projectId, caseStudy]),
)
