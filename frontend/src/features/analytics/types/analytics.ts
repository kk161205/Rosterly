// /analytics/* (§5.15, revised 18 Oct 2026) — mirrors backend app/modules/analytics/schemas.py.
// Money arrives as decimal strings.

export interface DateRange {
  from: string
  to: string
}

export interface DepartmentCost {
  department_id: string | null
  department_name: string
  hardware_cost: string
  software_cost: string
  total_cost: string
}

export interface UnusedLicence {
  license_id: string
  name: string
  vendor: string
  total_seats: number
  assigned_seats: number
  unused_seats: number
  cost_per_seat: string | null
  unused_cost_per_year: string
  renewal_date: string | null
}

export interface IdleAsset {
  asset_id: string
  asset_tag: string
  name: string
  category: string
  in_stock_since: string
  days_idle: number
  current_value: string
}

export interface Savings {
  unused_licences: UnusedLicence[]
  unused_licence_cost_per_year: string
  idle_assets: IdleAsset[]
  idle_asset_value: string
  idle_threshold_days: number
}

export interface BudgetAsset {
  asset_id: string
  asset_tag: string
  name: string
  holder_name: string | null
  date: string
  purchase_cost: string
}

export interface ReplacementQuarter {
  label: string
  start: string
  count: number
  replacement_cost: string
  assets: BudgetAsset[]
}

export interface Budget {
  past_end_of_life_count: number
  past_end_of_life_cost: string
  replacements: ReplacementQuarter[]
  replacement_cost_12_months: string
  warranties_expiring: BudgetAsset[]
}

export interface LeaverWithDevices {
  employee_id: string
  full_name: string
  date_of_exit: string | null
  checklist_id: string
  assets: { asset_id: string; asset_tag: string; name: string; current_value: string }[]
}

export interface FollowUps {
  leavers: LeaverWithDevices[]
  unreturned_count: number
  unreturned_value: string
  joiners_in_period: number
  joiners_ready_on_day_one: number
  upcoming_not_ready: { employee_id: string; full_name: string; date_of_joining: string; checklist_id: string; open_tasks: number }[]
}

export interface Turnaround {
  approval_median_hours: number | null
  approvals_by_step: { role_name: string | null; decisions: number; median_hours: number }[]
  stuck_requests: { request_id: string; title: string; waiting_on_role: string | null; waiting_days: number }[]
  stuck_threshold_days: number
  repair_median_hours: number | null
  repairs_by_priority: { priority: string; resolved: number; median_hours: number }[]
  repeat_assets: { asset_id: string; asset_tag: string; name: string; tickets: number }[]
}
