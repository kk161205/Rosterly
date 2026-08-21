import { UserRole } from './dashboard'

export type EmploymentStatus = 'active' | 'onboarding' | 'offboarding' | 'terminated' | 'on_leave' | 'inactive'

export interface ReportingNode {
  id: string
  full_name: string
  designation: string
  avatar_url?: string
  department?: string
  role?: string
}

export interface EmergencyContact {
  name: string
  relationship: string
  phone: string
  email?: string
}

export interface EmployeeProfile {
  id: string
  employee_code: string
  full_name: string
  email: string
  role_id?: string
  role_name?: string
  role?: UserRole | string
  department_id?: string | null
  department_name?: string | null
  department?: string
  manager_id?: string | null
  manager_name?: string | null
  manager?: ReportingNode | null
  direct_reports?: ReportingNode[]
  designation: string
  phone?: string | null
  status: EmploymentStatus
  date_of_joining?: string
  joining_date?: string
  date_of_exit?: string | null
  created_at?: string
  location?: string
  avatar_url?: string
  emergency_contact?: EmergencyContact
  address?: string
  bio?: string
}

export type DocumentCategory = 'contract' | 'identity' | 'tax' | 'certification' | 'id_proof' | 'offer_letter' | 'policy_ack' | 'other'

export interface DocumentItem {
  id: string
  employee_id?: string
  file_name: string
  doc_name?: string
  doc_type: DocumentCategory | string
  is_confidential: boolean
  uploaded_by?: string
  uploaded_by_name?: string | null
  uploaded_at: string
  size_bytes?: number
  file_url: string
}

export type AssetCategory = 'laptop' | 'monitor' | 'mobile' | 'software_license' | 'furniture' | 'peripherals' | 'license' | 'other'
export type WarrantyStatus = 'active' | 'expiring_soon' | 'expired'

export interface AssignedAssetItem {
  id: string
  asset_id?: string
  asset_name: string
  asset_tag: string
  serial_number?: string | null
  category: AssetCategory
  assigned_by?: string
  assigned_by_name?: string | null
  assigned_at: string
  returned_at?: string | null
  condition_at_assignment?: string
  condition_at_return?: string | null
  notes?: string | null
  warranty_expires_at?: string
  warranty_status?: WarrantyStatus
  specs?: string
  status?: 'active' | 'returned' | 'maintenance' | string
}

export interface AssetHistoryItem {
  id: string
  asset_id?: string
  asset_name: string
  asset_tag: string
  category: AssetCategory
  assigned_at: string
  returned_at?: string | null
  condition_at_assignment?: string
  condition_at_return?: string | null
  notes?: string | null
  reason?: string
}

export interface AssignedAssetsResponse {
  current: AssignedAssetItem[]
  history: AssetHistoryItem[]
}

export interface ChecklistItem {
  id: string
  title: string
  category: 'hr' | 'it' | 'facilities' | string
  owner_role: string
  status: 'pending' | 'in_progress' | 'completed' | 'done' | string
  due_date?: string | null
  completed_at?: string | null
}

export interface LifecycleChecklist {
  id: string
  type: 'onboarding' | 'offboarding' | string
  status: 'active' | 'completed' | 'in_progress' | 'cancelled' | string
  progress_percentage: number
  total_items: number
  completed_items: number
  items: ChecklistItem[]
}

export interface ProfileUpdatePayload {
  phone?: string | null
  address?: string
  emergency_contact?: EmergencyContact
  designation?: string
  department?: string
  department_id?: string | null
  role_id?: string | null
  status?: EmploymentStatus
  role?: UserRole
}

