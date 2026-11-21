import { humanize } from '@/lib/format'

/**
 * Plain words for every action code the API writes (S12). The codes stay in
 * the CSV export, where auditors match them against other systems.
 */
export const ACTION_LABEL: Record<string, string> = {
  'approval_chain.created': 'Approval chain added',
  'approval_chain.updated': 'Approval chain changed',
  'approval_chain.deleted': 'Approval chain deleted',
  'asset.created': 'Asset added',
  'asset.updated': 'Asset details changed',
  'asset.assigned': 'Asset assigned',
  'asset.returned': 'Asset returned',
  'asset.bulk_status_updated': 'Asset status changed in bulk',
  'asset.hard_deleted': 'Asset deleted',
  'company_setting.updated': 'Company setting changed',
  'department.created': 'Department added',
  'department.updated': 'Department changed',
  'department.deleted': 'Department deleted',
  'document.uploaded': 'Document uploaded',
  'document.deleted': 'Document deleted',
  'employee.profile_updated': 'Profile changed',
  'employee.deleted': 'Person removed',
  'holiday.created': 'Holiday added',
  'holiday.deleted': 'Holiday removed',
  'leave_balance.adjusted': 'Leave balance adjusted',
  'leave_request.approved': 'Leave approved',
  'leave_request.rejected': 'Leave rejected',
  'leave_request.cancelled': 'Leave cancelled',
  'leave_type.created': 'Leave type added',
  'leave_type.updated': 'Leave type changed',
  'offboarding.checklist_created': 'Offboarding started',
  'offboarding.item_updated': 'Offboarding task updated',
  'offboarding.completed': 'Offboarding finished',
  'onboarding.checklist_created': 'Onboarding started',
  'onboarding.item_updated': 'Onboarding task updated',
  'request.created': 'Request raised',
  'request.step_approved': 'Request approved at one step',
  'request.approved': 'Request approved',
  'request.rejected': 'Request rejected',
  'request.cancelled': 'Request cancelled',
  'request.fulfilment_updated': 'Request work updated',
  'role.conflicts_updated': 'Role combinations changed',
  'software_license.created': 'Licence added',
  'software_license.updated': 'Licence changed',
  'software_license.seat_assigned': 'Licence seat given',
  'software_license.seat_removed': 'Licence seat taken back',
  'software_license.synced': 'Licence synced from provider',
  'user.created': 'Account created',
  'user.invite_accepted': 'Password set',
  'user.onboarding_completed': 'Account activated',
  'user.sign_in_link_created': 'Sign-in link created',
  'user.role_changed': 'Role changed',
  'user.status_changed': 'Account status changed',
  'user.force_logout': 'Signed out everywhere',
  'user.mfa_enabled': 'Two-step sign-in turned on',
  'user.mfa_disabled': 'Two-step sign-in turned off',
  'user.mfa_reset': 'Two-step sign-in reset',
}

export const RECORD_LABEL: Record<string, string> = {
  approval_chain: 'Approval chain',
  asset: 'Asset',
  checklist: 'Checklist',
  checklist_item: 'Checklist task',
  company_setting: 'Company setting',
  department: 'Department',
  document: 'Document',
  holiday: 'Holiday',
  leave_balance: 'Leave balance',
  leave_type: 'Leave type',
  leave_request: 'Leave',
  request: 'Request',
  role: 'Role',
  software_license: 'Licence',
  user: 'Person',
}

export const actionLabel = (code: string) => ACTION_LABEL[code] ?? humanize(code.replace('.', ' '))
export const recordLabel = (type: string) => RECORD_LABEL[type] ?? humanize(type)

/** "21 Nov 2026, 03:45 pm" in the viewer's time zone. */
export const whenText = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
