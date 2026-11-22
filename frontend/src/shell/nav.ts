import type { UserProfile } from '@/features/auth/types/auth'
import { hasPermission, hasRole } from '@/features/auth/hooks/useCurrentUser'

/**
 * The app's navigation: one flat list, at most
 * seven entries for any role. Related pages are tabs inside a section rather
 * than more sidebar items. Visibility mirrors what the API allows the caller.
 */
export interface NavLink {
  label: string
  path: string
  visible: (user: UserProfile) => boolean
}

export interface NavSection {
  label: string
  /** Paths (and their sub-paths) that light this section up. */
  match: string[]
  links: NavLink[]
  showCount?: boolean
}

const can = (permission: string) => (user: UserProfile) => hasPermission(user, permission)
const anyOf =
  (...permissions: string[]) =>
  (user: UserProfile) =>
    permissions.some((p) => hasPermission(user, p))
// Lifecycle endpoints authorise by role, not by a permission row
const LIFECYCLE_ROLES = ['super_admin', 'hr_admin', 'it_admin', 'manager']
const lifecycle = (user: UserProfile) => hasRole(user, ...LIFECYCLE_ROLES)

const NAV: NavSection[] = [
  {
    label: 'Home',
    match: ['/home'],
    showCount: true,
    links: [{ label: 'Home', path: '/home', visible: () => true }],
  },
  {
    label: 'Assets',
    match: ['/assets', '/licenses'],
    links: [
      { label: 'Inventory', path: '/assets', visible: can('assets:read') },
      { label: 'Licences', path: '/licenses', visible: can('software_license:read') },
      { label: 'Scan a QR code', path: '/assets/qr', visible: can('assets:lookup') },
    ],
  },
  {
    label: 'Maintenance',
    match: ['/maintenance'],
    links: [
      {
        label: 'Maintenance',
        path: '/maintenance',
        // Everyone who can raise requests can raise and follow tickets for their own devices.
        visible: anyOf('maintenance_ticket:read', 'maintenance_ticket:create', 'request:create'),
      },
    ],
  },
  {
    label: 'Requests',
    match: ['/requests', '/approval-chains'],
    links: [
      { label: 'Requests', path: '/requests', visible: anyOf('request:create', 'request:read') },
      { label: 'Approval Chains', path: '/approval-chains', visible: can('approval_chain:read') },
    ],
  },
  {
    label: 'People',
    match: ['/employees', '/leave', '/onboarding', '/offboarding', '/departments'],
    links: [
      // The directory is open to every signed-in user; profiles check employee:read
      { label: 'Directory', path: '/employees', visible: () => true },
      { label: 'Leave & Attendance', path: '/leave', visible: () => true },
      { label: 'Onboarding', path: '/onboarding', visible: lifecycle },
      { label: 'Offboarding', path: '/offboarding', visible: lifecycle },
      { label: 'Departments', path: '/departments', visible: can('department:create') },
    ],
  },
  {
    label: 'Analytics',
    match: ['/analytics'],
    links: [
      {
        label: 'Analytics',
        path: '/analytics',
        visible: anyOf(
          'analytics:savings',
          'analytics:cost_by_department',
          'analytics:budget_forecast',
          'analytics:follow_ups',
          'analytics:turnaround',
        ),
      },
    ],
  },
  {
    label: 'Access',
    match: ['/users', '/roles', '/audit-logs', '/settings'],
    links: [
      { label: 'Users', path: '/users', visible: can('user:read') },
      { label: 'Roles', path: '/roles', visible: can('role:read') },
      { label: 'Audit log', path: '/audit-logs', visible: can('audit_log:read') },
      // Super admins (security) and HR admins (people settings) have settings they can change
      { label: 'Settings', path: '/settings', visible: (user) => hasRole(user, 'super_admin', 'hr_admin') },
    ],
  },
]

export interface VisibleSection extends NavSection {
  /** Where the sidebar entry goes: the first link this user can open. */
  path: string
}

export function visibleNav(user: UserProfile | null): VisibleSection[] {
  if (!user) return []
  return NAV.map((section) => ({ ...section, links: section.links.filter((l) => l.visible(user)) }))
    .filter((section) => section.links.length > 0)
    .map((section) => ({ ...section, path: section.links[0].path }))
}

function matches(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(base + '/')
}

export function activeSection(sections: VisibleSection[], pathname: string): VisibleSection | undefined {
  return sections.find((s) => s.match.some((m) => matches(pathname, m)))
}

/** The tab inside a section that the current path belongs to (most specific wins). */
export function activeLink(section: VisibleSection, pathname: string): NavLink | undefined {
  return [...section.links]
    .sort((a, b) => b.path.length - a.path.length)
    .find((l) => matches(pathname, l.path))
}

/**
 * Where a page sits in the sidebar, for the AI Guide's page map: the section,
 * the tab (only when the section has several) and who may open it — the same
 * rule the sidebar uses.
 */
export function navPlacement(route: string): { section: string; tab?: string; visible: (user: UserProfile) => boolean } | undefined {
  for (const section of NAV) {
    const link = section.links.find((l) => l.path === route)
    if (link) return { section: section.label, tab: section.links.length > 1 ? link.label : undefined, visible: link.visible }
  }
  return undefined
}

/**
 * False when the path is a sidebar page this person can't see, so the shell
 * shows one "no access" state instead of the page firing calls the API refuses.
 * Paths outside the sidebar (profiles, asset records…) handle access themselves.
 */
export function canOpen(user: UserProfile | null, pathname: string): boolean {
  const place = navPlacement(pathname.replace(/\/+$/, '') || '/')
  return !user || !place || place.visible(user)
}
