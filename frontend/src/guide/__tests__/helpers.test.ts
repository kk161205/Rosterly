import { describe, expect, it } from 'vitest'
import type { UserProfile } from '@/features/auth/types/auth'
import { pagesFor } from '@/guide/pageMap'
import { validatePlan } from '@/guide/plan'
import { explainAccess } from '@/guide/access'
import { recordFor } from '@/guide/GuideProvider'

const EMPLOYEE: UserProfile = { id: 'e', email: 'e@example.com', full_name: 'E', role: 'employee', permissions: ['request:create', 'request:read'] }
const IT: UserProfile = { id: 'i', email: 'i@example.com', full_name: 'I', role: 'it_admin', permissions: ['assets:read', 'software_license:read', 'request:create', 'request:read'] }
const ID = '11111111-2222-3333-4444-555555555555'

describe('Answers', () => {
  it('keeps only links to pages this person can open', () => {
    const plan = validatePlan(
      {
        kind: 'answer',
        question: 'q',
        text: 'Here.',
        links: [
          { label: 'AST-1', path: `/assets/${ID}` },
          { label: 'Users', path: '/users' },
          { label: 'Elsewhere', path: 'https://example.com' },
        ],
      },
      pagesFor(IT),
    )
    expect(plan.kind === 'answer' && plan.links).toEqual([{ label: 'AST-1', path: `/assets/${ID}` }])
  })

  it('knows which record is open on screen', () => {
    expect(recordFor(`/assets/${ID}`)).toEqual({ type: 'asset', id: ID })
    expect(recordFor(`/employees/${ID}`)).toEqual({ type: 'employee', id: ID })
    expect(recordFor('/assets/qr')).toBeUndefined()
  })
})

describe('“Why can’t I open this?” without AI', () => {
  it('says who a page is for and who can change roles', () => {
    const reply = explainAccess('why can’t I open analytics?', EMPLOYEE, '/home')
    expect(reply?.kind).toBe('answer')
    expect(reply?.kind === 'answer' && reply.text).toMatch(/^Analytics is for IT admins, HR admins, super admins and auditors.*ask a super admin/)
  })

  it('uses the page on screen for “this page”', () => {
    const reply = explainAccess("why can't I see this page", EMPLOYEE, '/licenses')
    expect(reply?.kind === 'answer' && reply.text).toMatch(/^Licences is for IT admins, super admins and auditors/)
  })

  it('tells someone who can open it where it is', () => {
    const reply = explainAccess('why can’t I open licences', IT, '/home')
    expect(reply?.kind === 'answer' && reply.text).toMatch(/^You can open Licences\. It’s under Assets/)
  })

  it('leaves other “why can’t I” questions to the Guide', () => {
    expect(explainAccess('why can’t I complete this offboarding?', EMPLOYEE, '/home')).toBeNull()
    expect(explainAccess('how many laptops are in stock', EMPLOYEE, '/home')).toBeNull()
  })
})
