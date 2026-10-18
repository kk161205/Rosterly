// /requests (§5.11) — mirrors backend app/modules/requests/schemas.py

export type RequestType = 'asset_request' | 'access_request' | 'it_ticket' | 'other'
export type RequestPriority = 'low' | 'medium' | 'high'
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'in_progress' | 'completed' | 'cancelled'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'skipped'

export interface RequestSummary {
  id: string
  requester_id: string
  requester_name: string | null
  requester_department: string | null
  request_type: RequestType
  title: string
  description: string
  related_asset_id: string | null
  related_asset_name: string | null
  estimated_cost: string | null
  priority: RequestPriority
  status: RequestStatus
  current_step: number
  total_steps: number
  waiting_on_role: string | null
  created_at: string
  updated_at: string
}

export interface RequestApproval {
  id: string
  step_order: number
  approver_id: string | null
  approver_name: string | null
  approver_role_name: string | null
  status: ApprovalStatus
  decision_at: string | null
  comments: string | null
  created_at: string
}

export interface RequestDetail extends RequestSummary {
  approvals: RequestApproval[]
}

export interface RequestListResponse {
  items: RequestSummary[]
  total: number
  page: number
  page_size: number
}

export interface RequestCreatePayload {
  request_type: RequestType
  title: string
  description: string
  estimated_cost?: number
  priority: RequestPriority
}
