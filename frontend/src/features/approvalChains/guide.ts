import type { GuidePage } from '@/guide/types'

export const GUIDE: GuidePage[] = [
  {
    id: 'approval-chains',
    route: '/approval-chains',
    title: 'Approval chains',
    purpose: 'Who approves each kind of request, in order, and above what cost.',
    words: ['approval chain', 'approvers', 'who approves', 'workflow', 'approval rules', 'threshold'],
    targets: [
      { id: 'chains.new', label: 'New chain', kind: 'button', changes: false },
      { id: 'chains.save', label: 'Create chain / Save changes (in the editor)', kind: 'button', changes: true, after: 'chains.new' },
      { id: 'chains.filter', label: 'Kind of request', kind: 'filter', changes: false },
    ],
  },
]
