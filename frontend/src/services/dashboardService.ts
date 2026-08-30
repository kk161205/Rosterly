import { apiClient } from '@/lib/api-client'
import {
  DashboardResponse,
  DashboardMetricCard,
} from '@/types/dashboard'

export const dashboardService = {
  /**
   * GET /dashboard/summary (PRD §5.2)
   * Fetches real-time role-aware metrics and widget data from backend database.
   */
  async getDashboardSummary(): Promise<DashboardResponse> {
    const response = await apiClient.get<DashboardResponse>('/dashboard/summary')
    return response.data
  },

  /**
   * Helper utility to transform role-aware metrics into standardized top-ribbon cards.
   */
  getMetricRibbonCards(response: DashboardResponse): DashboardMetricCard[] {
    const { role, metrics } = response

    switch (role) {
      case 'manager':
        return [
          {
            id: 'm1',
            label: 'Pending Approvals',
            value: metrics.pending_approvals_count ?? 0,
            change: 'Needs Your Review',
            changeType: 'neutral',
            iconName: 'approval',
            badgeText: 'Action Req.',
            badgeVariant: 'warning',
          },
          {
            id: 'm2',
            label: 'Team Headcount',
            value: metrics.team_headcount ?? 0,
            change: 'Active Members',
            changeType: 'neutral',
            iconName: 'team',
            badgeText: 'Department',
            badgeVariant: 'accent',
          },
          {
            id: 'm3',
            label: 'Dept Asset Allocation',
            value: `${metrics.dept_asset_allocation ?? 0}%`,
            change: 'Hardware Assigned',
            changeType: 'positive',
            iconName: 'asset',
            badgeText: 'Allocation',
            badgeVariant: 'tertiary',
          },
          {
            id: 'm4',
            label: 'Unread Alerts',
            value: metrics.unread_alerts_count ?? 0,
            change: 'System Notifications',
            changeType: 'neutral',
            iconName: 'alert',
            badgeText: (metrics.unread_alerts_count ?? 0) > 0 ? 'Urgent' : 'Clear',
            badgeVariant: (metrics.unread_alerts_count ?? 0) > 0 ? 'error' : 'neutral',
          },
        ]

      case 'hr_admin':
        return [
          {
            id: 'hr1',
            label: 'Active Onboardings',
            value: metrics.active_onboardings_count ?? 0,
            change: 'In-progress checklists',
            changeType: 'positive',
            iconName: 'onboarding',
            badgeText: 'Onboarding',
            badgeVariant: 'accent',
          },
          {
            id: 'hr2',
            label: 'Active Offboardings',
            value: metrics.active_offboardings_count ?? 0,
            change: 'Pending clearance',
            changeType: 'neutral',
            iconName: 'offboarding',
            badgeText: 'Clearance',
            badgeVariant: 'warning',
          },
          {
            id: 'hr3',
            label: 'Document Watchlist',
            value: metrics.document_expiry_watchlist_count ?? 0,
            change: 'Confidential Records',
            changeType: 'neutral',
            iconName: 'audit',
            badgeText: 'Compliance',
            badgeVariant: 'tertiary',
          },
          {
            id: 'hr4',
            label: 'Total Employees',
            value: metrics.total_employees_count ?? 0,
            change: 'Total Headcount',
            changeType: 'positive',
            iconName: 'users',
            badgeText: 'Directory',
            badgeVariant: 'accent',
          },
        ]

      case 'it_admin':
        return [
          {
            id: 'it1',
            label: 'Open Maintenance Tickets',
            value: metrics.open_maintenance_tickets_count ?? 0,
            change: 'Hardware repairs',
            changeType: 'negative',
            iconName: 'ticket',
            badgeText: 'Support',
            badgeVariant: 'error',
          },
          {
            id: 'it2',
            label: 'Warranty Expiring (30d)',
            value: metrics.warranty_expiring_count ?? 0,
            change: 'Upcoming expirations',
            changeType: 'neutral',
            iconName: 'warranty',
            badgeText: 'Contracts',
            badgeVariant: 'warning',
          },
          {
            id: 'it3',
            label: 'Available Stock Count',
            value: metrics.available_stock_count ?? 0,
            change: 'In-Stock Devices',
            changeType: 'positive',
            iconName: 'stock',
            badgeText: 'Ready',
            badgeVariant: 'tertiary',
          },
          {
            id: 'it4',
            label: 'Total Assets',
            value: metrics.total_assets_count ?? 0,
            change: 'Managed Inventory',
            changeType: 'positive',
            iconName: 'asset',
            badgeText: 'Catalog',
            badgeVariant: 'accent',
          },
        ]

      case 'super_admin':
      case 'auditor':
        return [
          {
            id: 'sa1',
            label: 'Total System Users',
            value: metrics.total_users_count ?? 0,
            change: 'Identity Registry',
            changeType: 'positive',
            iconName: 'users',
            badgeText: 'System Wide',
            badgeVariant: 'accent',
          },
          {
            id: 'sa2',
            label: 'Total Managed Assets',
            value: metrics.total_assets_count ?? 0,
            change: 'Tracking Active',
            changeType: 'positive',
            iconName: 'asset',
            badgeText: 'Inventory',
            badgeVariant: 'tertiary',
          },
          {
            id: 'sa3',
            label: 'System Health',
            value: metrics.system_health ?? 'Healthy',
            change: 'Uptime Active',
            changeType: 'positive',
            iconName: 'health',
            badgeText: 'Operational',
            badgeVariant: 'tertiary',
          },
          {
            id: 'sa4',
            label: 'Audit Log Stream',
            value: metrics.audit_events_count ?? 0,
            change: 'Immutable Ledger',
            changeType: 'neutral',
            iconName: 'audit',
            badgeText: 'Secured',
            badgeVariant: 'neutral',
          },
        ]

      case 'employee':
      default:
        return [
          {
            id: 'emp1',
            label: 'My Assigned Assets',
            value: metrics.my_assigned_assets_count ?? 0,
            change: 'Active hardware & licenses',
            changeType: 'neutral',
            iconName: 'asset',
            badgeText: 'Active',
            badgeVariant: 'tertiary',
          },
          {
            id: 'emp2',
            label: 'My Open Requests',
            value: metrics.my_open_requests_count ?? 0,
            change: 'Requests in review',
            changeType: 'positive',
            iconName: 'request',
            badgeText: 'Track',
            badgeVariant: 'accent',
          },
          {
            id: 'emp3',
            label: 'Pending Tasks',
            value: metrics.pending_tasks_count ?? 0,
            change: 'Checklist action items',
            changeType: 'neutral',
            iconName: 'task',
            badgeText: 'Action',
            badgeVariant: 'warning',
          },
          {
            id: 'emp4',
            label: 'Unread Alerts',
            value: metrics.unread_alerts_count ?? 0,
            change: 'Notifications',
            changeType: 'neutral',
            iconName: 'alert',
            badgeText: (metrics.unread_alerts_count ?? 0) > 0 ? 'New' : 'All Clear',
            badgeVariant: (metrics.unread_alerts_count ?? 0) > 0 ? 'accent' : 'neutral',
          },
        ]
    }
  },
}
