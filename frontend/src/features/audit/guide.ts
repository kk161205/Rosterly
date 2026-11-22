import type { GuidePage } from '@/guide/types'

export const GUIDE: GuidePage[] = [
  {
    id: 'audit-logs',
    route: '/audit-logs',
    title: 'Audit log',
    purpose: 'Who did what, and when — every change, for review and export.',
    words: ['audit', 'history', 'who changed', 'log', 'compliance', 'activity'],
    targets: [
      { id: 'audit.what', label: 'What happened', kind: 'field', changes: false },
      { id: 'audit.when', label: 'When', kind: 'field', changes: false },
      { id: 'audit.download', label: 'Download CSV', kind: 'button', changes: true },
    ],
  },
]
