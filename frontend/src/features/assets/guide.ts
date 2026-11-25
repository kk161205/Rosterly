import type { GuidePage } from '@/guide/types'
import { hasPermission } from '@/features/auth/hooks/useCurrentUser'

const can = (permission: string) => (user: Parameters<typeof hasPermission>[0]) => hasPermission(user, permission)

export const GUIDE: GuidePage[] = [
  {
    id: 'assets',
    route: '/assets',
    title: 'Assets',
    purpose: 'The whole company’s devices and equipment: who has each one, where it is, and adding new ones. (Your own devices are on Your profile.)',
    words: ['inventory', 'equipment', 'devices', 'laptops', 'monitors', 'hardware', 'add a laptop', 'stock'],
    targets: [
      { id: 'assets.add', label: 'Add asset', kind: 'button', changes: false, visible: can('assets:create'), note: 'Only for new equipment the company has just bought — giving someone a device is Assign on its record.' },
      { id: 'assets.add-save', label: 'Add asset (in the form)', kind: 'button', changes: true, after: 'assets.add', visible: can('assets:create') },
      { id: 'assets.search', label: 'Search assets', kind: 'field', changes: false },
      { id: 'assets.status', label: 'Status tabs (in stock, assigned, in repair…)', kind: 'filter', changes: false, note: 'In stock lists devices free to give someone.' },
      { id: 'assets.scan', label: 'Scan QR', kind: 'link', changes: false, visible: can('assets:lookup') },
    ],
  },
  {
    id: 'asset',
    route: '/assets/:id',
    title: 'Asset record',
    purpose: 'One asset: who holds it, its details and history; assign it, take it back or raise a ticket. Everyone can open the devices assigned to them.',
    words: ['assign a laptop', 'give someone a device', 'return a device', 'check in a device', 'asset details', 'asset history', 'repair'],
    // Anyone may open a device they hold (the API checks the rest); asset admins open any.
    visible: () => true,
    reach: 'Your own devices: Your profile → Equipment tab, then click the device. Asset admins: open Assets, then click the asset (or "Open full record and history" in its side panel).',
    targets: [
      { id: 'asset.assign', label: 'Assign', kind: 'button', changes: false, visible: can('assets:update'), note: 'Only while the asset is in stock.' },
      { id: 'asset.return', label: 'Return to stock', kind: 'button', changes: false, visible: can('assets:update'), note: 'Only while the asset is assigned to someone.' },
      { id: 'asset.repaired', label: 'Mark repaired', kind: 'button', changes: true, visible: can('assets:update'), note: 'Only while the asset is in repair.' },
      { id: 'asset.ticket', label: 'Raise ticket', kind: 'button', changes: false, note: 'Not for retired assets.' },
      { id: 'asset.activity', label: 'Activity filter', kind: 'filter', changes: false },
    ],
  },
  {
    id: 'qr',
    route: '/assets/qr',
    title: 'Scan a QR code',
    purpose: 'Scan or type an asset tag to find a device and check it in or out.',
    words: ['qr', 'barcode', 'scan', 'asset tag', 'check out a device', 'camera'],
    targets: [
      { id: 'qr.camera', label: 'Start camera', kind: 'button', changes: true },
      { id: 'qr.tag', label: 'Asset tag', kind: 'field', changes: false },
      { id: 'qr.find', label: 'Find', kind: 'button', changes: false },
    ],
  },
  {
    id: 'maintenance',
    route: '/maintenance',
    title: 'Maintenance',
    purpose: 'Repair tickets for equipment: report a problem and follow it until it’s fixed.',
    words: ['ticket', 'my tickets', 'repair', 'broken', 'not working', 'report an issue', 'it support', 'fix'],
    targets: [
      { id: 'maintenance.raise', label: 'Raise ticket', kind: 'button', changes: false },
      { id: 'maintenance.status', label: 'Status tabs', kind: 'filter', changes: false },
      { id: 'maintenance.view', label: 'Table or board view', kind: 'filter', changes: false },
    ],
  },
]
