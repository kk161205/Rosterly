export interface LicenseItem {
  id: string
  name: string
  vendor: string
  total_seats: number
  seats_used: number
  cost_per_seat: number | null
  renewal_date: string | null
  /** "manual" (IT gives seats here) or a connected provider, e.g. "microsoft_365". */
  source: string
  last_synced_at?: string | null
  created_at: string
  updated_at: string
}

export interface LicenseListResponse {
  items: LicenseItem[]
  total: number
}

export interface LicenseHolder {
  assignment_id: string
  employee_id: string
  full_name: string
  email: string
  source: string
  assigned_at: string
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
