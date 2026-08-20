import { UserRole } from './dashboard'

export type EmploymentStatus = 'active' | 'onboarding' | 'offboarding' | 'terminated' | 'on_leave'

export interface ReportingNode {
  id: string
  full_name: string
  designation: string
  avatar_url?: string
  department?: string
  role: string
}

export interface EmergencyContact {
  name: string
  relationship: string
  phone: string
  email?: string
}

export interface EmployeeProfile {
  id: string
  full_name: string
  email: string
  phone: string
  designation: string
  department: string
  department_id?: string
  location: string
  avatar_url?: string
  role: UserRole
  status: EmploymentStatus
  joining_date: string
  employee_code: string
  manager?: ReportingNode | null
  direct_reports?: ReportingNode[]
  emergency_contact?: EmergencyContact
  address?: string
  bio?: string
}

export type DocumentCategory = 'contract' | 'identity' | 'tax' | 'certification' | 'other'

export interface DocumentItem {
  id: string
  doc_name: string
  doc_type: DocumentCategory
  is_confidential: boolean
  uploaded_at: string
  uploaded_by_name: string
  size_bytes: number
  file_url: string
}

export type AssetCategory = 'laptop' | 'monitor' | 'mobile' | 'peripherals' | 'license'
export type WarrantyStatus = 'active' | 'expiring_soon' | 'expired'

export interface AssignedAssetItem {
  id: string
  asset_name: string
  asset_tag: string
  serial_number: string
  category: AssetCategory
  assigned_at: string
  warranty_expires_at: string
  warranty_status: WarrantyStatus
  specs?: string
  status: 'active' | 'returned' | 'maintenance'
}

export interface AssetHistoryItem {
  id: string
  asset_name: string
  asset_tag: string
  category: AssetCategory
  assigned_at: string
  returned_at: string
  reason?: string
}

export interface AssignedAssetsResponse {
  current: AssignedAssetItem[]
  history: AssetHistoryItem[]
}

export interface ChecklistItem {
  id: string
  title: string
  category: 'hr' | 'it' | 'facilities'
  owner_role: string
  status: 'pending' | 'in_progress' | 'completed'
  due_date?: string
  completed_at?: string
}

export interface LifecycleChecklist {
  id: string
  type: 'onboarding' | 'offboarding'
  status: 'active' | 'completed' | 'cancelled'
  progress_percentage: number
  total_items: number
  completed_items: number
  items: ChecklistItem[]
}

export interface ProfileUpdatePayload {
  phone?: string
  address?: string
  emergency_contact?: EmergencyContact
  designation?: string
  department?: string
  status?: EmploymentStatus
  role?: UserRole
}
