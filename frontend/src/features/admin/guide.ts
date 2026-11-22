import type { GuidePage } from '@/guide/types'

export const GUIDE: GuidePage[] = [
  {
    id: 'users',
    route: '/users',
    title: 'Users',
    purpose: 'Everyone’s account: roles, sign-in links, two-step reset, and signing someone out.',
    words: ['accounts', 'change role', 'give admin', 'reset password', 'sign-in link', 'deactivate', 'lock out'],
    targets: [
      { id: 'users.search', label: 'Search users', kind: 'field', changes: false },
      { id: 'users.role', label: 'Role filter', kind: 'filter', changes: false },
      { id: 'users.status', label: 'Status filter', kind: 'filter', changes: false },
    ],
  },
  {
    id: 'roles',
    route: '/roles',
    title: 'Roles',
    purpose: 'What each role can do, and which roles can’t be held together.',
    words: ['permissions', 'role', 'access rights', 'what can managers do'],
    targets: [{ id: 'roles.pick', label: 'Role', kind: 'field', changes: false }],
  },
  {
    id: 'settings',
    route: '/settings',
    title: 'Settings',
    purpose: 'Company-wide switches (super admins and HR): require two-step sign-in for all admins, self check-in, the AI assistant.',
    words: ['company settings', 'require two-step', 'turn off ai', 'check-in setting'],
    targets: [{ id: 'settings.list', label: 'Settings list', kind: 'section', changes: false }],
  },
]
