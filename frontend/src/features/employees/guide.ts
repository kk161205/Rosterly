import type { GuidePage } from '@/guide/types'
import { hasPermission } from '@/features/auth/hooks/useCurrentUser'

const PROFILE_TARGETS: GuidePage['targets'] = [
  { id: 'profile.edit', label: 'Edit profile / Edit contact details', kind: 'button', changes: false, note: 'HR edits everything; people edit their own contact details.' },
  { id: 'profile.equipment', label: 'Equipment tab', kind: 'tab', changes: false },
  { id: 'profile.documents', label: 'Documents tab', kind: 'tab', changes: false },
  { id: 'profile.upload', label: 'Upload (documents)', kind: 'button', changes: false, after: 'profile.documents' },
  { id: 'profile.lifecycle', label: 'Joining and leaving tab', kind: 'tab', changes: false },
]

export const GUIDE: GuidePage[] = [
  {
    id: 'directory',
    route: '/employees',
    title: 'Directory',
    purpose: 'Everyone in the company: find a person, their team and what they hold; org chart view.',
    words: ['people', 'employees', 'staff', 'find someone', 'colleague', 'org chart', 'team', 'phone number'],
    targets: [
      { id: 'directory.search', label: 'Search people', kind: 'field', changes: false },
      { id: 'directory.view', label: 'List or org chart view', kind: 'filter', changes: false },
      { id: 'directory.onboard', label: 'Onboard someone', kind: 'link', changes: false, visible: (u) => hasPermission(u, 'employee:create') },
    ],
  },
  {
    id: 'person',
    route: '/employees/:id',
    title: 'Person’s profile',
    purpose: 'One person: contact details, equipment, documents, and joining or leaving.',
    words: ['profile', 'employee details', 'their equipment', 'their documents'],
    visible: (user) => hasPermission(user, 'employee:read'),
    reach: 'Open Directory, click the person, then "Open profile" in the side panel.',
    targets: PROFILE_TARGETS,
  },
  {
    id: 'profile',
    route: '/profile',
    title: 'Your profile',
    purpose: 'Your own details, equipment and documents, and setting up your own two-step sign-in (authenticator app).',
    words: ['my profile', 'my details', 'my equipment', 'my documents', 'two-step', 'mfa', 'authenticator', 'change phone'],
    visible: () => true,
    targets: [...PROFILE_TARGETS, { id: 'profile.security', label: 'Sign-in tab (two-step sign-in)', kind: 'tab', changes: false }],
  },
  {
    id: 'departments',
    route: '/departments',
    title: 'Departments',
    purpose: 'The company’s departments and who heads each one.',
    words: ['department', 'team', 'add a department', 'head of department'],
    targets: [
      { id: 'departments.add', label: 'Add department', kind: 'button', changes: false },
      { id: 'departments.save', label: 'Add department / Save (in the form)', kind: 'button', changes: true, after: 'departments.add' },
    ],
  },
]
