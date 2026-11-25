import { describe, expect, it } from 'vitest'
import type { UserProfile } from '@/features/auth/types/auth'
import { pagesFor } from '@/guide/pageMap'
import { validatePlan } from '@/guide/plan'
import { lockedPages } from '@/guide/access'
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

describe('“Why can’t I open this?”: facts for the AI', () => {
  it('lists the pages this person can’t open and who each is for, and nothing they can open', () => {
    const locked = lockedPages(pagesFor(EMPLOYEE))
    expect(locked).toContainEqual({ title: 'Analytics', who: 'IT admins, HR admins, super admins and auditors (each sees the sections for their work)' })
    expect(locked.map((p) => p.title)).not.toContain('Leave & Attendance')
  })
})

describe('Tile timing', () => {
  it('gives longer captions more time, within limits', async () => {
    const { readingTime } = await import('@/guide/GuideProvider')
    const t = { move: 600, dwell: 1400, perChar: 45, maxDwell: 2600 }
    expect(readingTime('Open Leave', t)).toBe(1650)
    expect(readingTime('Hi', t)).toBe(1400)
    expect(readingTime('A very long caption that goes on and on for quite a while', t)).toBe(2600)
    expect(readingTime('anything', { move: 0, dwell: 0 })).toBe(0)
  })
})
