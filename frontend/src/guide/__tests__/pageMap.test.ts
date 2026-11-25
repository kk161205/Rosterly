import { describe, expect, it } from 'vitest'
import type { UserProfile } from '@/features/auth/types/auth'
import { PAGE_MAP, matchPages, pagesFor, routeText, toAiPages } from '@/guide/pageMap'
import appSource from '@/app/App.tsx?raw'

/**
 * Keeps the AI Guide's page map true to the code. When one
 * of these fails, describe the new page in its feature's guide.ts, or fix the
 * data-guide tag that moved.
 */
const sources = import.meta.glob<string>(['../../**/*.tsx', '!../../**/__tests__/**', '!../../test/**'], { query: '?raw', import: 'default', eager: true })
const appSources = Object.entries(sources).filter(([path]) => !path.includes('__tests__'))

/** Every guide id written in the code: data-guide="x", or quoted ids inside data-guide={…}. */
function tagsInCode(): Map<string, string[]> {
  const found = new Map<string, string[]>()
  for (const [path, code] of appSources) {
    for (const m of code.matchAll(/data-guide=(?:"([^"]+)"|\{([^}]*)\})/g)) {
      const ids = m[1] ? [m[1]] : [...m[2].matchAll(/['"`]([a-z0-9-]+\.[a-z0-9-]+)['"`]/g)].map((x) => x[1])
      for (const id of ids) found.set(id, [...(found.get(id) ?? []), path])
    }
  }
  return found
}

/** The opening tag around each data-guide id, to check what pressing it does. */
function openingTag(id: string): string {
  for (const [, code] of appSources) {
    const i = code.indexOf(`'${id}'`) >= 0 && code.includes('data-guide={') ? code.indexOf(`'${id}'`) : code.indexOf(`data-guide="${id}"`)
    if (i < 0) continue
    const start = code.lastIndexOf('<', i)
    const end = code.indexOf('\n', code.indexOf('>', i))
    return code.slice(start, end)
  }
  return ''
}

const user = (role: string, permissions: string[]): UserProfile => ({ id: 'u', email: 'u@example.com', full_name: 'U', role, permissions })
const EMPLOYEE = user('employee', ['request:create', 'request:read', 'maintenance_ticket:create', 'assets:lookup'])
const SUPER = user('super_admin', [
  'assets:read', 'assets:create', 'assets:update', 'assets:lookup', 'software_license:read', 'software_license:create',
  'maintenance_ticket:read', 'request:create', 'request:read', 'request:fulfil', 'approval_chain:read', 'employee:read',
  'employee:create', 'department:create', 'leave_request:approve', 'leave_policy:manage', 'analytics:savings',
  'user:read', 'role:read', 'audit_log:read',
])

describe('Page map is complete', () => {
  const shellRoutes = [...appSource.matchAll(/<Route path="([^"]+)" element=\{withSuspense\(/g)].map((m) => m[1])

  it('reads the signed-in routes from App.tsx', () => {
    expect(shellRoutes.length).toBeGreaterThanOrEqual(20)
  })

  it('describes every signed-in route exactly once, and nothing that isn’t a route', () => {
    const described = PAGE_MAP.map((p) => p.route)
    const missing = shellRoutes.filter((r) => !described.includes(r))
    expect(missing, `Describe these routes in a features/*/guide.ts: ${missing.join(', ')}`).toEqual([])
    expect(described.filter((r) => !shellRoutes.includes(r))).toEqual([])
    expect(new Set(described).size).toBe(described.length)
    expect(new Set(PAGE_MAP.map((p) => p.id)).size).toBe(PAGE_MAP.length)
  })

  it('has a title, a one-line purpose and words people use for every page', () => {
    for (const p of PAGE_MAP) {
      expect(p.title, p.id).toBeTruthy()
      expect(p.purpose.length, p.id).toBeGreaterThan(20)
      expect(p.purpose, p.id).not.toMatch(/\n/)
      expect(p.words.length, p.id).toBeGreaterThanOrEqual(3)
      expect(routeText(p), p.id).toBeTruthy()
      if (!p.navigable) expect(p.reach, `${p.id} has an id in its address, so say how to reach it`).toBeTruthy()
    }
  })

  it('finds every target’s data-guide tag in the code', () => {
    const tags = tagsInCode()
    const missing = PAGE_MAP.flatMap((p) => p.targets.map((t) => t.id)).filter((id) => !tags.has(id))
    expect(missing, `No data-guide tag in the code for: ${missing.join(', ')}`).toEqual([])
  })

  it('has no data-guide tag in the code that the map doesn’t know', () => {
    const known = new Set(PAGE_MAP.flatMap((p) => p.targets.map((t) => t.id)))
    const orphans = [...tagsInCode().keys()].filter((id) => !known.has(id))
    expect(orphans, `Add these to a guide.ts or remove the tag: ${orphans.join(', ')}`).toEqual([])
  })

  it('keeps target ids unique on a page, namespaced, and "after" pointing at the same page', () => {
    for (const p of PAGE_MAP) {
      const ids = p.targets.map((t) => t.id)
      expect(new Set(ids).size, p.id).toBe(ids.length)
      for (const t of p.targets) {
        expect(t.id, p.id).toMatch(/^[a-z-]+\.[a-z0-9-]+$/)
        if (t.after) expect(ids, `${t.id} opens after ${t.after}`).toContain(t.after)
      }
    }
  })

  it('marks every button that saves, sends or deletes as changing, so the Guide can only point at it', () => {
    // A lookup is a submit button that changes nothing.
    const EXEMPT = new Set(['qr.find'])
    // Saving, sending, deleting, deciding, exporting or starting the camera — directly or inside an arrow.
    const changing =
      /onClick=\{\s*(?:\(\)\s*=>\s*)?(?:void\s+)?(save|submit|add|handleSubmit|start\w*|create|run|markRepaired|cancel|handleDelete|approve|reject|delete\w*|remove\w*|confirm|send|onExport|export\w*)\b|\.mutate(?:Async)?\(|type="submit"|role="switch"/
    const wrong = PAGE_MAP.flatMap((p) => p.targets)
      .filter((t) => !EXEMPT.has(t.id) && !t.changes && changing.test(openingTag(t.id)))
      .map((t) => t.id)
    expect(wrong, `These change data but are marked changes: false: ${wrong.join(', ')}`).toEqual([])
  })
})

describe('Trimmed to what the person can open', () => {
  it('never includes pages an employee can’t open', () => {
    const ids = pagesFor(EMPLOYEE).map((p) => p.id)
    expect(ids).toEqual(expect.arrayContaining(['home', 'requests', 'leave', 'profile', 'directory', 'notifications', 'assistant', 'qr']))
    for (const hidden of ['users', 'roles', 'audit-logs', 'settings', 'approval-chains', 'analytics', 'assets', 'licenses', 'departments', 'onboarding']) {
      expect(ids).not.toContain(hidden)
    }
  })

  it('lets an employee open the record of a device they hold, without the admin buttons', () => {
    const asset = pagesFor(EMPLOYEE).find((p) => p.id === 'asset')!
    expect(asset.navigable).toBe(false) // reached from Your profile → Equipment, never walked to
    expect(asset.targets.map((t) => t.id)).not.toEqual(expect.arrayContaining(['asset.assign']))
    expect(asset.targets.map((t) => t.id)).not.toContain('asset.return')
  })

  it('drops targets the person won’t have on a page they can open', () => {
    const leave = pagesFor(EMPLOYEE).find((p) => p.id === 'leave')!
    expect(leave.targets.map((t) => t.id)).not.toContain('leave.settings')
    expect(leave.targets.map((t) => t.id)).not.toContain('leave.team')
    const adminLeave = pagesFor(SUPER).find((p) => p.id === 'leave')!
    expect(adminLeave.targets.map((t) => t.id)).toEqual(expect.arrayContaining(['leave.team', 'leave.settings']))
  })

  it('gives nothing to nobody', () => {
    expect(pagesFor(null)).toEqual([])
  })
})

describe('What the AI service receives', () => {
  it('is plain data: no functions, survives JSON, and carries how to reach each page', () => {
    const pages = toAiPages(pagesFor(SUPER))
    expect(JSON.parse(JSON.stringify(pages))).toEqual(pages)
    const licences = pages.find((p) => p.id === 'licenses')!
    expect(licences.how_to_reach).toBe('Assets → Licences')
    expect(pages.find((p) => p.id === 'asset')).toMatchObject({ navigable: false, how_to_reach: expect.stringMatching(/Equipment tab.*open Assets/) })
    expect(pages.find((p) => p.id === 'home')!.how_to_reach).toBe('Home')
  })

  it('stays small enough to send with every question', () => {
    expect(JSON.stringify(toAiPages(pagesFor(SUPER))).length).toBeLessThan(16_000)
  })
})

describe('Instant matching, no AI', () => {
  const best = (q: string, u = SUPER) => matchPages(q, pagesFor(u))[0]?.page.id
  it.each([
    ['leave', 'leave'],
    ['time off', 'leave'],
    ['I want a new laptop', 'requests'],
    ['who changed this', 'audit-logs'],
    ['org chart', 'directory'],
    ['licences', 'licenses'],
    ['broken monitor', 'maintenance'],
    ['new joiner', 'onboarding'],
    ['change my colour', 'assistant'],
    ['two-step', 'profile'],
    // Your own things go to your own pages, even for admins who can see everyone's.
    ['show me my assigned assets', 'profile'],
    ['my assets', 'profile'],
    ['my laptop', 'profile'],
    ['my devices', 'profile'],
    ['inventory', 'assets'],
    ['my leave', 'leave'],
    ['check in', 'leave'],
    ['my tickets', 'maintenance'],
  ])('“%s” → %s', (q, page) => {
    expect(best(q)).toBe(page)
  })

  it('never offers a page the person can’t open', () => {
    expect(matchPages('audit log', pagesFor(EMPLOYEE)).map((m) => m.page.id)).not.toContain('audit-logs')
  })

  it('returns nothing for noise', () => {
    expect(matchPages('   ', pagesFor(SUPER))).toEqual([])
    expect(matchPages('zzqx', pagesFor(SUPER))).toEqual([])
  })
})
