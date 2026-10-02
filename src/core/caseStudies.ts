/** Client-facing case-study contract shared by routes and static publishing. */
type CaseStudyDisclosure = 'client' | 'self-initiated' | 'experimental' | 'ai-assisted'

interface CaseStudyProof {
  label: string
  value: string
}

interface CaseStudyMedia {
  alt: string
  width: number
  height: number
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
  ru: CaseStudyCopy
}

export interface CaseStudyCopy {
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
}
