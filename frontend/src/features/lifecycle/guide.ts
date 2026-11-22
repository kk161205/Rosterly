import type { GuidePage } from '@/guide/types'
import { hasRole } from '@/features/auth/hooks/useCurrentUser'

// Starting a checklist is HR's job (ChecklistWorkflow MANAGER_ROLES).
const hr = (u: Parameters<typeof hasRole>[0]) => hasRole(u, 'hr_admin', 'super_admin')

export const GUIDE: GuidePage[] = [
  {
    id: 'onboarding',
    route: '/onboarding',
    title: 'Onboarding',
    purpose: 'Bring a new joiner in: create their account and track their first-day checklist.',
    words: ['new joiner', 'new hire', 'new employee', 'add a person', 'add user', 'create account', 'onboard', 'first day'],
    targets: [
      { id: 'onboarding.start', label: 'Add new joiner', kind: 'button', changes: false, visible: hr },
      { id: 'onboarding.add-save', label: 'Add joiner (in the form)', kind: 'button', changes: true, after: 'onboarding.start', visible: hr },
      { id: 'onboarding.start-save', label: 'Start (for someone who already has an account)', kind: 'button', changes: true, after: 'onboarding.start', visible: hr },
      { id: 'onboarding.status', label: 'Status tabs', kind: 'filter', changes: false },
    ],
  },
  {
    id: 'offboarding',
    route: '/offboarding',
    title: 'Offboarding',
    purpose: 'When someone leaves: get equipment back, take licences back and close their account.',
    words: ['leaver', 'leaving', 'exit', 'resign', 'offboard', 'last day', 'return equipment'],
    targets: [
      { id: 'offboarding.start', label: 'Start offboarding', kind: 'button', changes: false, visible: hr },
      { id: 'offboarding.start-save', label: 'Start (in the form)', kind: 'button', changes: true, after: 'offboarding.start', visible: hr },
      { id: 'offboarding.status', label: 'Status tabs', kind: 'filter', changes: false },
    ],
  },
]
