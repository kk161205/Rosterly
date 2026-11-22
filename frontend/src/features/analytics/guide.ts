import type { GuidePage } from '@/guide/types'

export const GUIDE: GuidePage[] = [
  {
    id: 'analytics',
    route: '/analytics',
    title: 'Analytics',
    purpose: 'Money we can save, where the money went, what to budget for, what needs chasing, where we’re slow.',
    words: ['reports', 'spend', 'cost', 'budget', 'savings', 'unused licences', 'idle equipment', 'forecast', 'turnaround'],
    targets: [{ id: 'analytics.range', label: 'Time range', kind: 'filter', changes: false }],
  },
]
