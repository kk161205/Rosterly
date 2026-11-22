import { describe, expect, it } from 'vitest'
import type { UserProfile } from '@/features/auth/types/auth'
import { pagesFor } from '@/guide/pageMap'
import { planLocally, validatePlan, type GuidePlan } from '@/guide/plan'
import { toPlan } from '@/guide/aiPlanner'

const SUPER: UserProfile = {
  id: 'u', email: 'u@example.com', full_name: 'U', role: 'super_admin',
  permissions: [
    'assets:read', 'assets:create', 'assets:update', 'assets:lookup', 'software_license:read', 'software_license:create',
    'maintenance_ticket:read', 'maintenance_ticket:create', 'request:create', 'request:read', 'approval_chain:read',
    'employee:read', 'employee:create', 'department:create', 'leave_request:approve', 'leave_policy:manage',
    'user:read', 'role:read', 'audit_log:read', 'analytics:savings',
  ],
}
const EMPLOYEE: UserProfile = { id: 'e', email: 'e@example.com', full_name: 'E', role: 'employee', permissions: ['request:create', 'request:read'] }
const pages = pagesFor(SUPER)
const steps = (plan: GuidePlan) => (plan.kind === 'show' ? plan.steps : [])

describe('Local planner — the Guide without AI', () => {
  it('goes to the page and points at the button that fits the words', () => {
    expect(steps(planLocally('how do I ask for leave', pages))).toEqual([
      { action: 'go', page: 'leave', caption: 'Open Leave & Attendance' },
      { action: 'point', target: 'leave.apply', caption: 'Press Ask for leave' },
    ])
    expect(steps(planLocally('add a new laptop to inventory', pages))[1]).toMatchObject({ action: 'point', target: 'assets.add' })
    expect(steps(planLocally('report a broken monitor', pages))[1]).toMatchObject({ target: 'maintenance.raise' })
  })

  it('just opens the page when no button fits', () => {
    expect(steps(planLocally('analytics', pages))).toEqual([{ action: 'go', page: 'analytics', caption: 'Open Analytics' }])
  })

  it('sends record pages through their list, with how to reach one', () => {
    const plan = planLocally('assign a laptop to someone', pages)
    expect(plan).toMatchObject({ kind: 'show', title: 'Asset record' })
    expect(steps(plan)[0]).toEqual({ action: 'go', page: 'assets', caption: 'Open Assets' })
    expect(steps(plan)[1]).toMatchObject({ action: 'say', caption: expect.stringContaining('Then press Assign') })
  })

  it('says plainly when nothing matches', () => {
    expect(planLocally('zzqx', pages)).toMatchObject({ kind: 'none', message: expect.stringContaining('zzqx') })
  })

  it('only ever plans pages the person can open', () => {
    const plan = planLocally('audit log', pagesFor(EMPLOYEE))
    expect(JSON.stringify(plan)).not.toContain('audit-logs')
  })
})

describe('validatePlan — every plan, local or AI, is checked', () => {
  const show = (s: unknown[]): GuidePlan => ({ kind: 'show', title: 'T', steps: s as never })

  it('drops pages and targets the person wasn’t given', () => {
    const checked = validatePlan(show([{ action: 'go', page: 'users' }, { action: 'point', target: 'users.search', caption: 'x' }, { action: 'go', page: 'leave' }]), pagesFor(EMPLOYEE))
    expect(steps(checked)).toEqual([{ action: 'go', page: 'leave', caption: undefined }])
  })

  it('never opens or fills something that changes data — it becomes a point', () => {
    const checked = validatePlan(
      show([
        { action: 'open', target: 'notifications.mark-all', caption: 'Mark all read' },
        { action: 'fill', target: 'notifications.mark-all', value: 'x', caption: 'no' },
        { action: 'open', target: 'leave.apply', caption: 'ok' },
      ]),
      pages,
    )
    expect(steps(checked).map((s) => s.action)).toEqual(['point', 'point', 'point']) // a tour never ends on the Guide opening a form
  })

  it('opens the tab or form a target lives behind when the plan forgot to', () => {
    const checked = validatePlan(
      show([
        { action: 'go', page: 'leave', caption: 'Open Leave' },
        { action: 'point', target: 'leave.add-holiday', caption: 'Press Add holiday' },
      ]),
      pages,
    )
    expect(steps(checked)).toEqual([
      { action: 'go', page: 'leave', caption: 'Open Leave' },
      { action: 'open', target: 'leave.settings', caption: 'Open Settings tab' },
      { action: 'point', target: 'leave.add-holiday', caption: 'Press Add holiday' },
    ])
    const already = validatePlan(
      show([
        { action: 'go', page: 'leave' },
        { action: 'open', target: 'leave.settings', caption: 'Settings' },
        { action: 'point', target: 'leave.add-holiday', caption: 'Add holiday' },
      ]),
      pages,
    )
    expect(steps(already).map((s) => s.action)).toEqual(['go', 'open', 'point']) // not opened twice
  })

  it('stops once a button has opened its form, except for that form’s own targets', () => {
    const checked = validatePlan(
      show([
        { action: 'go', page: 'assets', caption: 'Open Assets' },
        { action: 'open', target: 'assets.add', caption: 'Add asset' },
        { action: 'fill', target: 'assets.search', value: 'laptop', caption: 'Search the new laptop' }, // behind the form
        { action: 'point', target: 'assets.add-save', caption: 'Save' },
      ]),
      pages,
    )
    expect(steps(checked).map((s) => s.action)).toEqual(['go', 'point'])
    const inForm = validatePlan(
      show([
        { action: 'go', page: 'assets' },
        { action: 'open', target: 'assets.add', caption: 'Add asset' },
        { action: 'point', target: 'assets.add-save', caption: 'Press Add asset when ready' },
      ]),
      pages,
    )
    expect(steps(inForm).map((s) => s.action)).toEqual(['go', 'open', 'point'])
  })

  it('only fills fields, and only with text', () => {
    const checked = validatePlan(
      show([
        { action: 'fill', target: 'assets.search', value: 'MacBook', caption: 'Type' },
        { action: 'fill', target: 'leave.apply', value: 'x', caption: 'not a field' },
        { action: 'fill', target: 'assets.search', value: { evil: true }, caption: 'object' },
      ]),
      pages,
    )
    expect(steps(checked)).toEqual([
      { action: 'fill', target: 'assets.search', value: 'MacBook', caption: 'Type' },
      { action: 'point', target: 'leave.apply', caption: 'not a field' },
      { action: 'point', target: 'assets.search', caption: 'object' },
    ])
  })

  it('never navigates straight to a record page, ignores unknown actions, caps the length', () => {
    const checked = validatePlan(show([{ action: 'go', page: 'asset' }, { action: 'click', target: 'leave.send' }, ...Array(20).fill({ action: 'say', caption: 'hi' })]), pages)
    expect(steps(checked)).toHaveLength(6) // 8 steps examined; the first two are dropped
    expect(steps(checked).every((s) => s.action === 'say')).toBe(true)
  })

  it('turns an unusable plan into "none", never a stray click', () => {
    expect(validatePlan(show([{ action: 'point', target: 'made.up', caption: 'x' }]), pages)).toMatchObject({ kind: 'none' })
    expect(validatePlan({ kind: 'ask', question: 'Which?', choices: [{ label: 'X', plan: show([{ action: 'go', page: 'nope' }]) }] }, pages)).toMatchObject({ kind: 'none' })
  })
})

describe('AI replies become plans', () => {
  it('maps each reply kind, and ask-back choices to "go" plans with real titles', () => {
    expect(toPlan({ kind: 'show', title: 'T', steps: [{ action: 'go', page: 'leave' }] }, 'q', pages)).toEqual({ kind: 'show', title: 'T', steps: [{ action: 'go', page: 'leave' }] })
    expect(toPlan({ kind: 'answer', text: 'Two.', page: 'requests' }, 'how many', pages)).toEqual({ kind: 'answer', question: 'how many', text: 'Two.', table: undefined, page: 'requests' })
    const ask = toPlan({ kind: 'ask', choices: [{ label: 'x', page: 'leave' }] }, 'q', pages)
    expect(ask).toMatchObject({ kind: 'ask', choices: [{ label: 'Leave & Attendance', plan: { kind: 'show', steps: [{ action: 'go', page: 'leave' }] } }] })
    expect(toPlan({ kind: 'none' }, 'q', pages)).toMatchObject({ kind: 'none' })
  })

  it('validatePlan trims answers, caps tables and drops pages the person can’t open', () => {
    const checked = validatePlan(
      { kind: 'answer', question: 'q', text: 'x'.repeat(2000), page: 'users', table: { columns: ['a', 'b', 'c', 'd', 'e'], rows: Array(20).fill(['1', '2', '3', '4', '5']) } },
      pagesFor(EMPLOYEE),
    )
    expect(checked).toMatchObject({ kind: 'answer' })
    if (checked.kind !== 'answer') return
    expect(checked.text).toHaveLength(600)
    expect(checked.page).toBeUndefined()
    expect(checked.table!.columns).toHaveLength(4)
    expect(checked.table!.rows).toHaveLength(8)
    expect(validatePlan({ kind: 'answer', question: 'q', text: '' }, pages)).toMatchObject({ kind: 'none' })
  })
})
