// /onboarding and /offboarding (§5.5, §5.6) — backend ChecklistResponse

export type ChecklistType = 'onboarding' | 'offboarding'
export type ChecklistItemStatus = 'pending' | 'in_progress' | 'done'
export type ChecklistStatus = 'in_progress' | 'completed'

export interface ChecklistItem {
  id: string
  checklist_id: string
  task_name: string
  owner_role_id: string
  owner_role_name: string | null
  status: ChecklistItemStatus
  completed_by: string | null
  completed_by_name: string | null
  asset_assignment_id: string | null
  completed_at: string | null
  sort_order: number
}

export interface Checklist {
  id: string
  employee_id: string
  employee_name: string | null
  employee_designation: string | null
  employee_department: string | null
  date_of_joining: string | null
  date_of_exit: string | null
  type: ChecklistType
  status: ChecklistStatus
  completed_at: string | null
  created_at: string
  progress_percentage: number
  total_items: number
  completed_items: number
  items: ChecklistItem[]
}

export interface ChecklistListResponse {
  checklists: Checklist[]
  total: number
  page: number
  page_size: number
  total_pages: number
}
