export type ChecklistItemStatus = 'pending' | 'in_progress' | 'done'

export type ChecklistStatus = 'in_progress' | 'completed'

export interface OffboardingChecklistItem {
  id: string
  checklist_id: string
  task_name: string
  owner_role_id: string
  owner_role_name?: string
  status: ChecklistItemStatus
  completed_by?: string | null
  completed_by_name?: string | null
  completed_at?: string | null
  asset_assignment_id?: string | null
  sort_order: number
  created_at: string
}

export interface OffboardingChecklist {
  id: string
  employee_id: string
  employee_name?: string
  employee_email?: string
  employee_designation?: string
  department_name?: string
  exit_date?: string | null
  reason?: string | null
  avatar_url?: string
  type: 'offboarding'
  status: ChecklistStatus
  completed_at?: string | null
  created_at: string
  updated_at: string
  progress_percentage: number
  total_items: number
  completed_items: number
  items: OffboardingChecklistItem[]
}

export interface OffboardingCreateRequest {
  employee_id: string
  exit_date?: string | null
  reason?: string | null
}

export interface ChecklistItemUpdateRequest {
  status: ChecklistItemStatus
}

export interface OffboardingListResponse {
  checklists: OffboardingChecklist[]
  total: number
}

export interface OffboardingSummaryMetrics {
  total_active_offboardings: number
  pending_asset_reclamations: number
  pending_access_revocations: number
  completed_offboardings: number
  avg_completion_days: number
}

export type OffboardingCategoryKey = 'asset_recovery' | 'access_revocation' | 'exit_settlement'
