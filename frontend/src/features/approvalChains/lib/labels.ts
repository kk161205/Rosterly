import type { ChainRequestType } from '@/features/approvalChains/types/approvalChains'

/** Roles that hold `request:approve` (fixed roles). The API rejects any other role in a chain. */
export const CHAIN_APPROVER_ROLES = ['manager', 'it_admin', 'hr_admin', 'super_admin']

export const REQUEST_TYPE_LABEL: Record<ChainRequestType, string> = {
  asset_request: 'Equipment',
  access_request: 'Access',
  it_ticket: 'IT help',
  other: 'Other',
}
