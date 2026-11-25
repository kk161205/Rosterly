import type { GuidePage } from '@/guide/types'
import { hasPermission } from '@/features/auth/hooks/useCurrentUser'

export const GUIDE: GuidePage[] = [
  {
    id: 'leave',
    route: '/leave',
    title: 'Leave & Attendance',
    purpose: 'Ask for leave, see what you have left, your month, and (for approvers) your team’s leave.',
    words: ['leave', 'holiday', 'vacation', 'time off', 'day off', 'sick', 'pto', 'balance', 'my leave', 'leave left', 'attendance', 'check in', 'my attendance'],
    targets: [
      { id: 'leave.apply', label: 'Ask for leave', kind: 'button', changes: false },
      { id: 'leave.send', label: 'Send request (in the form)', kind: 'button', changes: true, after: 'leave.apply' },
      { id: 'leave.mine', label: 'My leave tab', kind: 'tab', changes: false },
      { id: 'leave.attendance', label: 'My month tab', kind: 'tab', changes: false },
      { id: 'leave.team', label: 'Team tab (approvers)', kind: 'tab', changes: false, visible: (u) => hasPermission(u, 'leave_request:approve') },
      { id: 'leave.settings', label: 'Settings tab (HR: leave types, holidays)', kind: 'tab', changes: false, visible: (u) => hasPermission(u, 'leave_policy:manage') },
      { id: 'leave.add-holiday', label: 'Add holiday (date and name first)', kind: 'button', changes: true, after: 'leave.settings', visible: (u) => hasPermission(u, 'leave_policy:manage') },
      { id: 'leave.add-type', label: 'Add leave type', kind: 'button', changes: false, after: 'leave.settings', visible: (u) => hasPermission(u, 'leave_policy:manage') },
    ],
  },
]
