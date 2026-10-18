import { humanize } from '@/lib/format'

/** Readable names for permission resources and actions (§5.13), shared by Roles and the Roles dialog. */
const RESOURCE_LABEL: Record<string, string> = {
  analytics: 'Analytics',
  assets: 'Assets',
  employee: 'People',
  maintenance_ticket: 'Maintenance tickets',
  request: 'Requests',
  role: 'Roles',
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
}

export function resourceLabel(resource: string): string {
  return RESOURCE_LABEL[resource] ?? humanize(resource)
}

export function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? humanize(action)
}
