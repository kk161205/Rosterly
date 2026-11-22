import { describe, expect, it } from 'vitest'
import { activeLink, activeSection, canOpen, visibleNav } from '@/shell/nav'
import type { UserProfile } from '@/features/auth/types/auth'

const user = (role: string, permissions: string[]): UserProfile => ({
  id: 'u', email: 'u@example.com', full_name: 'U', role, permissions,
})

describe('shell navigation', () => {
  it('shows an employee only what their permissions allow', () => {
    const labels = visibleNav(user('employee', ['request:create', 'assets:lookup'])).map((s) => s.label)
    expect(labels).toEqual(['Home', 'Assets', 'Maintenance', 'Requests', 'People']) // Maintenance: the tickets they raised
  })

  it('opens People on the directory for everyone, as the API does', () => {
    const people = visibleNav(user('it_admin', ['assets:read'])).find((s) => s.label === 'People')!
    expect(people.path).toBe('/employees')
    expect(people.links.map((l) => l.label)).toEqual(['Directory', 'Leave & Attendance', 'Onboarding', 'Offboarding'])
  })

  it('sends a section to the first page the user can open', () => {
    const assets = visibleNav(user('employee', ['assets:lookup'])).find((s) => s.label === 'Assets')
    expect(assets?.path).toBe('/assets/qr')
  })

  it('never lists more than seven sections', () => {
    const all = visibleNav(
      user('super_admin', [
        'assets:read', 'assets:lookup', 'maintenance_ticket:read', 'request:read', 'employee:read',
        'analytics:savings', 'user:read', 'role:read',
      ]),
    )
    expect(all.length).toBeLessThanOrEqual(7)
  })

  it('lifecycle tabs follow the backend role rule, not a permission', () => {
    const people = (role: string) =>
      visibleNav(user(role, [])).find((s) => s.label === 'People')?.links.map((l) => l.label)
    expect(people('hr_admin')).toEqual(['Directory', 'Leave & Attendance', 'Onboarding', 'Offboarding'])
    expect(people('employee')).toEqual(['Directory', 'Leave & Attendance'])
  })

  it('matches the most specific tab for nested paths', () => {
    const sections = visibleNav(user('it_admin', ['assets:read', 'assets:lookup']))
    const section = activeSection(sections, '/assets/qr')!
    expect(section.label).toBe('Assets')
    expect(activeLink(section, '/assets/qr')?.label).toBe('Scan a QR code')
    expect(activeLink(section, '/assets/123')?.label).toBe('Inventory')
  })
})

describe('page guard', () => {
  it('blocks sidebar pages the person cannot see, typed in by hand', () => {
    const employee = user('employee', ['request:create', 'request:read', 'employee:read'])
    for (const path of ['/analytics', '/licenses', '/approval-chains', '/roles', '/audit-logs', '/departments', '/settings', '/users', '/assets/qr']) {
      expect(canOpen(employee, path)).toBe(false)
    }
    expect(canOpen(employee, '/requests')).toBe(true)
    expect(canOpen(employee, '/analytics/')).toBe(false)
  })

  it('leaves pages outside the sidebar to check access themselves', () => {
    const employee = user('employee', [])
    for (const path of ['/profile', '/employees/abc', '/assets/123', '/notifications', '/assistant', '/home']) {
      expect(canOpen(employee, path)).toBe(true)
    }
  })

  it('lets the role in when it has the permission', () => {
    expect(canOpen(user('auditor', ['role:read', 'audit_log:read']), '/roles')).toBe(true)
    expect(canOpen(user('hr_admin', ['department:create']), '/settings')).toBe(true)
  })
})
