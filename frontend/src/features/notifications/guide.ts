import type { GuidePage } from '@/guide/types'

export const GUIDE: GuidePage[] = [
  {
    id: 'notifications',
    route: '/notifications',
    title: 'Notifications',
    purpose: 'Updates about your requests, approvals and equipment.',
    words: ['alerts', 'updates', 'messages', 'unread', 'bell'],
    visible: () => true,
    targets: [
      { id: 'notifications.show', label: 'Show (all, unread, approvals…)', kind: 'filter', changes: false },
      { id: 'notifications.mark-all', label: 'Mark all as read', kind: 'button', changes: true },
    ],
  },
]
