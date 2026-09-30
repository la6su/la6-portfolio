/** Client-facing case-study contract shared by routes and static publishing. */
type CaseStudyDisclosure = 'client' | 'self-initiated' | 'experimental' | 'ai-assisted'

interface CaseStudyProof {
  label: string
  value: string
  source: string
}

interface CaseStudyMedia {
  src: string
  alt: string
  width: number
  height: number
  kind: 'image' | 'video'
  caption?: string
}

export interface CaseStudy {
  projectId: string
  disclosure: CaseStudyDisclosure
  outcome: string
  context: string
  problem: string
  role: string
  constraints: string[]
  response: string
  stack: string[]
  result: string
  proof: CaseStudyProof[]
  media: CaseStudyMedia[]
  ctaLabel: string
}
