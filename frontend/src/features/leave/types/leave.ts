export type LeaveType = 'sick' | 'casual' | 'earned' | 'unpaid' | 'other'

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export interface LeaveRequestResponse {
  id: string
  employee_id: string
  employee_name?: string | null
  employee_email?: string | null
  leave_type: LeaveType
  start_date: string
  end_date: string
  total_days: number
  status: LeaveStatus
  approver_id?: string | null
  approver_name?: string | null
  reason?: string | null
  decision_comments?: string | null
  created_at: string
  updated_at: string
}

export interface LeaveBalanceItem {
  leave_type: LeaveType
  year: number
  balance_days: number
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

export interface LeaveRequestCreate {
  leave_type: LeaveType
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
