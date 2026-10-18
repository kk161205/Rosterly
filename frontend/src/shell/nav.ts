import type { UserProfile } from '@/features/auth/types/auth'
import { hasPermission, hasRole } from '@/features/auth/hooks/useCurrentUser'

/**
 * The app's navigation (DESIGN.md, Layout): one flat list, at most
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
// Lifecycle endpoints authorise by role (§5.5, §5.6), not by a permission row
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
    match: ['/assets'],
    links: [
      { label: 'Inventory', path: '/assets', visible: can('assets:read') },
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
        visible: anyOf('maintenance_ticket:read', 'maintenance_ticket:create'),
      },
    ],
  },
  {
    label: 'Requests',
    match: ['/requests'],
    links: [{ label: 'Requests', path: '/requests', visible: anyOf('request:create', 'request:read') }],
  },
  {
    label: 'People',
    match: ['/employees', '/onboarding', '/offboarding'],
    links: [
      // The directory is open to every signed-in user (§5.3); profiles check employee:read
      { label: 'Directory', path: '/employees', visible: () => true },
      { label: 'Onboarding', path: '/onboarding', visible: lifecycle },
      { label: 'Offboarding', path: '/offboarding', visible: lifecycle },
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
    match: ['/users', '/roles'],
    links: [
      { label: 'Users', path: '/users', visible: can('user:read') },
      { label: 'Roles', path: '/roles', visible: can('role:read') },
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
