import type { GuidePage } from '@/guide/types'

export const GUIDE: GuidePage[] = [
  {
    id: 'home',
    route: '/home',
    title: 'Home',
    purpose: 'What needs you today: approvals, tasks and tickets waiting on you, plus your key numbers.',
    words: ['dashboard', 'start', 'today', 'waiting on me', 'my tasks', 'inbox', 'approvals to do'],
    targets: [
      { id: 'home.new-request', label: 'New request', kind: 'link', changes: false },
      { id: 'home.scan', label: 'Scan a QR code', kind: 'link', changes: false },
    ],
  },
]
