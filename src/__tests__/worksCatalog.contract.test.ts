import { describe, expect, it } from 'vitest'
import { CASE_STUDY_BY_PROJECT } from '../Data/CaseStudies'
import { PROJECTS } from '../Data/Projects'
import { WORKS_ROOMS, getWorksCaseProject, setWorksCaseProject } from '../core/worksExperience'

describe('works catalog contract', () => {
  it('keeps the authored room order within the canonical project catalog', () => {
    expect(WORKS_ROOMS).toHaveLength(PROJECTS.length)
    expect(WORKS_ROOMS.map(({ projectIndex }) => PROJECTS[projectIndex]?.id)).toEqual(
      PROJECTS.map(({ id }) => id),
    )
  })

  it('does not expose case studies for unknown projects', () => {
    for (const projectId of CASE_STUDY_BY_PROJECT.keys()) {
      expect(PROJECTS.some((project) => project.id === projectId)).toBe(true)
    }
  })

  it('keeps the newer route intent when an older view unmounts late', () => {
    const releaseWorks = setWorksCaseProject(null)
    const releaseCase = setWorksCaseProject(2)
    releaseWorks()
    expect(getWorksCaseProject()).toBe(2)
    releaseCase()
    expect(getWorksCaseProject()).toBeNull()
  })
})
