import type { GuidePage } from '@/guide/types'
import { hasPermission } from '@/features/auth/hooks/useCurrentUser'

export const GUIDE: GuidePage[] = [
  {
    id: 'requests',
    route: '/requests',
    title: 'Requests',
    purpose: 'Ask for equipment, access or IT help, see where your requests are, and approve or fulfil others’.',
    words: ['request', 'ask for a laptop', 'new laptop', 'access', 'it help', 'approve', 'approval', 'to fulfil', 'my requests'],
    targets: [
      { id: 'requests.new', label: 'New request', kind: 'button', changes: false },
      { id: 'requests.submit', label: 'Submit request (in the form)', kind: 'button', changes: true, after: 'requests.new' },
      { id: 'requests.whose', label: 'Whose requests (yours, to approve, to fulfil)', kind: 'filter', changes: false, visible: (u) => hasPermission(u, 'request:fulfil') },
      { id: 'requests.status', label: 'Status tabs', kind: 'filter', changes: false },
    ],
  },
]
