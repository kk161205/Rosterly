import { apiClient } from '@/lib/api-client'

/**
 * GET /dashboard/summary (§5.2) — role-aware counts and short lists for Home.
 * The payload's metric keys depend on the caller's role (backend
 * app/modules/dashboard/schemas.py), so fields are optional here.
 */
export interface HomeSummary {
  role: string
  metrics: {
    my_assigned_assets_count?: number
    my_open_requests_count?: number
    pending_tasks_count?: number
    pending_approvals_count?: number
    team_headcount?: number
    dept_asset_allocation?: number
    active_onboardings_count?: number
    active_offboardings_count?: number
    total_employees_count?: number
    open_maintenance_tickets_count?: number
    warranty_expiring_count?: number
    available_stock_count?: number
    total_assets_count?: number
    total_users_count?: number
    audit_events_count?: number
  }
  widgets: {
    my_assigned_assets?: { id: string; name: string; asset_tag: string; category: string; assigned_at: string | null }[]
    my_open_requests?: { id: string; title: string; request_type: string; status: string; created_at: string }[]
    system_overview?: { total_users?: number; active_users?: number; total_assets?: number; assigned_assets?: number; pending_requests?: number }
  }
}

// Under the Inbox key: everything that refreshes the Inbox after an action refreshes these numbers too
export const HOME_SUMMARY_KEY = ['inbox', 'home-summary'] as const

export const homeService = {
  async summary(): Promise<HomeSummary> {
    return (await apiClient.get<HomeSummary>('/dashboard/summary')).data
  },
}
