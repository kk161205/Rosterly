import type { GuidePage } from '@/guide/types'
import { hasPermission } from '@/features/auth/hooks/useCurrentUser'

const manage = (u: Parameters<typeof hasPermission>[0]) => hasPermission(u, 'software_license:create') || hasPermission(u, 'software_license:update')

export const GUIDE: GuidePage[] = [
  {
    id: 'licenses',
    route: '/licenses',
    title: 'Licences',
    purpose: 'Software the company pays for, who has a seat, and seats nobody uses.',
    words: ['software', 'licence', 'license', 'seats', 'subscription', 'figma', 'microsoft 365', 'renewal'],
    targets: [
      { id: 'licenses.add', label: 'Add Licence', kind: 'button', changes: false, visible: manage },
      { id: 'licenses.add-save', label: 'Add Licence (in the form)', kind: 'button', changes: true, after: 'licenses.add', visible: manage },
    ],
  },
]
