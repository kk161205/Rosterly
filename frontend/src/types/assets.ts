// Open, admin-extensible field — not a closed union. GET /assets/meta returns
// the distinct categories currently in use; the Add Asset form also lets an
// IT admin type a brand-new one.
export type AssetCategory = string

export type AssetStatus =
  | 'in_stock'
  | 'assigned'
  | 'under_maintenance'
  | 'retired'
  | 'lost'

export type DepreciationMethod = 'straight_line' | 'declining_balance' | 'none'

export interface CurrentHolderNested {
  id: string
  full_name: string
  email: string
  department_id?: string | null
  department_name?: string | null
}

export interface Asset {
  id: string
  asset_tag: string
  name: string
  category: AssetCategory
  serial_number?: string | null
  vendor: string
  purchase_date: string
  purchase_cost: number
  current_value: number
  depreciation_method: DepreciationMethod
  useful_life_months: number
  warranty_expiry?: string | null
  amc_expiry?: string | null
  status: AssetStatus
  current_holder_id?: string | null
  current_holder?: CurrentHolderNested | null
  license_id?: string | null
  is_expiring_soon?: boolean
  created_at: string
  updated_at: string
}

export interface AssetQueryFilters {
  search?: string
  category?: AssetCategory | 'all'
  status?: AssetStatus | 'all'
  department_id?: string | 'all'
  page?: number
  page_size?: number
}

export interface AssetListResponse {
  items: Asset[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface AssetCreatePayload {
  name: string
  category: AssetCategory
  serial_number?: string | null
  vendor: string
  purchase_date: string
  purchase_cost: number
  depreciation_method: DepreciationMethod
  useful_life_months: number
  warranty_expiry?: string | null
  amc_expiry?: string | null
}

export interface AssetUpdatePayload {
  name?: string
  category?: AssetCategory
  serial_number?: string | null
  vendor?: string
  purchase_date?: string
  purchase_cost?: number
  depreciation_method?: DepreciationMethod
  useful_life_months?: number
  warranty_expiry?: string | null
  amc_expiry?: string | null
  status?: AssetStatus
}

export interface AssetBulkUpdatePayload {
  asset_ids: string[]
  status: AssetStatus
}

export interface AssetSummaryStats {
  total: number
  deployed: number
  inStock: number
  underMaintenance: number
}

export interface AssetMetaResponse {
  categories: string[]
  statuses: AssetStatus[]
}

// --- Section 5.8 Asset Detail & History Interfaces ---

export interface AssetAssignment {
  id: string
  asset_id: string
  employee_id: string
  assigned_by: string
  assigned_at: string
  returned_at?: string | null
  condition_at_assignment: string
  condition_at_return?: string | null
  notes?: string | null
  employee_name?: string | null
  assigned_by_name?: string | null
}

export interface AssetDetailResponse {
  asset: Asset
  current_assignment?: AssetAssignment | null
}

export interface AssetAssignPayload {
  employee_id: string
  condition_notes: string
  notes?: string | null
}

export interface AssetReturnPayload {
  condition_notes: string
  notes?: string | null
}

export type TicketPriority = 'low' | 'medium' | 'high' | 'critical'
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed'

export interface MaintenanceTicket {
  id: string
  asset_id: string
  reported_by: string
  assigned_to?: string | null
  issue_description: string
  priority: TicketPriority
  status: TicketStatus
  resolved_at?: string | null
  created_at: string
  updated_at: string
  reporter_name?: string | null
  assignee_name?: string | null
}

export interface MaintenanceTicketCreatePayload {
  asset_id: string
  issue_description: string
  priority: TicketPriority
}
