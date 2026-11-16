export interface LicenseItem {
  id: string
  name: string
  vendor: string
  total_seats: number
  seats_used: number
  cost_per_seat: number | null
  renewal_date: string | null
  created_at: string
  updated_at: string
}

export interface LicenseListResponse {
  items: LicenseItem[]
  total: number
}

export interface LicenseHolder {
  employee_id: string
  full_name: string
  email: string
  asset_id: string
  asset_tag: string
  asset_name: string
}

export interface LicenseHoldersResponse {
  holders: LicenseHolder[]
}

export interface LicenseCreate {
  name: string
  vendor: string
  total_seats: number
  cost_per_seat?: number | null
  renewal_date?: string | null
}

export interface LicenseUpdate {
  name?: string
  vendor?: string
  total_seats?: number
  cost_per_seat?: number | null
  renewal_date?: string | null
}
