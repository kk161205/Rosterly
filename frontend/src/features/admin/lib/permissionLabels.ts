import { humanize } from '@/lib/format'

/** Readable names for permission resources and actions, shared by Roles and the Roles dialog. */
const RESOURCE_LABEL: Record<string, string> = {
  analytics: 'Analytics',
  approval_chain: 'Approval chains',
  assets: 'Assets',
  audit_log: 'Audit log',
  employee: 'People',
  leave_request: 'Leave approvals',
  maintenance_ticket: 'Maintenance tickets',
  request: 'Requests',
  role: 'Roles',
  software_license: 'Licences',
  user: 'Users',
}

const ACTION_LABEL: Record<string, string> = {
  savings: 'Savings (unused licences, idle stock)',
  cost_by_department: 'Cost by department',
  budget_forecast: 'Budget (replacements, warranties)',
  follow_ups: 'Follow-ups (leavers, joiners)',
  turnaround: 'Turnaround (approvals, repairs)',
  bulk_update: 'Bulk update',
  assign_role: 'Assign roles',
  force_logout: 'Force sign-out',
  lookup: 'Scan QR codes',
  create: 'Add',
  read: 'View',
  update: 'Edit',
  delete: 'Delete',
  approve: 'Approve',
}

export function resourceLabel(resource: string): string {
  return RESOURCE_LABEL[resource] ?? humanize(resource)
}

export function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? humanize(action)
}
