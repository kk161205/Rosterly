// Leave — leave types and holidays are the company's own.

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

/** A leave type as shown on a request or balance. */
export interface LeaveTypeRef {
  id: string
  name: string
  is_paid: boolean
  unlimited: boolean
}

/** GET /leave-types — the full rules, for the settings tab. */
export interface LeaveTypeItem {
  id: string
  name: string
  annual_days: string | null // null = no limit
  carry_forward_max: string
  is_paid: boolean
  pro_rate_on_join: boolean
  is_active: boolean
  sort_order: number
}

export interface LeaveTypePayload {
  name?: string
  annual_days?: string | null
  carry_forward_max?: string
  is_paid?: boolean
  pro_rate_on_join?: boolean
  is_active?: boolean
}

export interface Holiday {
  id: string
  date: string
  name: string
}

export interface LeaveRequestResponse {
  id: string
  employee_id: string
  employee_name?: string | null
  employee_email?: string | null
  leave_type: LeaveTypeRef
  start_date: string
  end_date: string
  total_days: number
  status: LeaveStatus
  approver_id?: string | null
  approver_name?: string | null
  reason?: string | null
  decision_comments?: string | null
  can_cancel: boolean
  created_at: string
  updated_at: string
}

export interface LeaveBalanceItem {
  leave_type: LeaveTypeRef
  year: number
  annual_days: string | null
  balance_days: string | null // null = no limit
  pending_days: string
}

export interface MyLeaveResponse {
  items: LeaveRequestResponse[]
  total: number
  page: number
  page_size: number
  balances: LeaveBalanceItem[]
}

export interface PendingLeaveResponse {
  items: LeaveRequestResponse[]
  total: number
  page: number
  page_size: number
}

export interface TeamLeaveResponse {
  items: LeaveRequestResponse[]
}

export interface EmployeeBalances {
  employee_id: string
  year: number
  balances: LeaveBalanceItem[]
}

export interface LeaveRequestCreate {
  leave_type_id: string
  start_date: string
  end_date: string
  reason?: string | null
}

export interface LeaveDecision {
  comments?: string | null
}

export interface LeaveRejection {
  comments: string
}
