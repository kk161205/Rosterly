export type ChecklistItemStatus = 'pending' | 'in_progress' | 'done'

export type ChecklistStatus = 'in_progress' | 'completed'

export interface ChecklistItem {
  id: string
  checklist_id: string
  task_name: string
  owner_role_id: string
  owner_role_name?: string
  status: ChecklistItemStatus
  completed_by?: string | null
  completed_by_name?: string | null
  completed_at?: string | null
  sort_order: number
  created_at: string
}

export interface OnboardingChecklist {
  id: string
  employee_id: string
  employee_name?: string
  employee_email?: string
  employee_designation?: string
  department_name?: string
  joining_date?: string
  avatar_url?: string
  type: 'onboarding'
  status: ChecklistStatus
  completed_at?: string | null
  created_at: string
  updated_at: string
  progress_percentage: number
  total_items: number
  completed_items: number
  items: ChecklistItem[]
}

export interface OnboardingCreateRequest {
  employee_id: string
  joining_date?: string
  custom_tasks?: string[]
}

export interface ChecklistItemUpdateRequest {
  status: ChecklistItemStatus
}

export interface OnboardingListResponse {
  checklists: OnboardingChecklist[]
  total: number
}

export interface AISuggestionTask {
  task_name: string
  owner_role_name: 'hr_admin' | 'it_admin' | 'facilities' | 'manager'
  category: string
  reasoning: string
}

export interface AISuggestionResponse {
  recommended_tasks: AISuggestionTask[]
  summary: string
}

export interface OnboardingSummaryMetrics {
  total_active_onboardings: number
  pending_it_tasks: number
  pending_hr_tasks: number
  avg_completion_days: number
  completion_rate: number
}
