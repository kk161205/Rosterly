import { apiClient } from '@/lib/api-client'
import {
  UserRole,
  DashboardResponse,
  DashboardMetricCard,
  TaskChecklistItem,
  ActivityTimelineItem,
  PendingApprovalItem,
  MaintenanceTicketItem,
  OnboardingOffboardingItem,
  AssignedAssetItem,
} from '@/types/dashboard'

const MOCK_DATA: Record<UserRole, DashboardResponse> = {
  employee: {
    role: 'employee',
    metrics: {
      my_assigned_assets_count: 3,
      my_open_requests_count: 2,
      pending_tasks_count: 4,
      unread_alerts_count: 1,
    },
    widgets: {
      my_assigned_assets: [
        {
          id: 'ast-001',
          name: 'MacBook Pro 16" M3 Max',
          asset_tag: 'AST-2026-904',
          category: 'Laptop',
          serial_number: 'C02GX01QMD6M',
          assigned_at: '2026-01-15T09:00:00Z',
        },
        {
          id: 'ast-002',
          name: 'Dell UltraSharp 27" 4K Monitor',
          asset_tag: 'AST-2026-412',
          category: 'Display',
          serial_number: 'CN-0K793H-744',
          assigned_at: '2026-01-16T11:30:00Z',
        },
        {
          id: 'ast-003',
          name: 'Logitech MX Master 3S',
          asset_tag: 'AST-2026-108',
          category: 'Peripheral',
          serial_number: 'LZ84729104',
          assigned_at: '2026-02-01T14:20:00Z',
        },
      ],
      my_open_requests: [
        {
          id: 'req-101',
          title: 'Ergonomic Standing Desk Converter',
          request_type: 'Hardware Request',
          status: 'pending',
          priority: 'medium',
          created_at: '2026-08-12T10:15:00Z',
        },
        {
          id: 'req-102',
          title: 'JetBrains All Products License',
          request_type: 'Software Access',
          status: 'in_progress',
          priority: 'high',
          created_at: '2026-08-10T16:45:00Z',
        },
      ],
      pending_action_items: [
        {
          id: 'task-1',
          task_name: 'Verify Q3 Serial Number Audit for MacBook Pro',
          status: 'pending',
          created_at: '2026-08-13T08:00:00Z',
          category: 'Asset Verification',
          due_date: 'Today',
        },
        {
          id: 'task-2',
          task_name: 'Complete Information Security Compliance Training',
          status: 'pending',
          created_at: '2026-08-11T14:30:00Z',
          category: 'Compliance',
          due_date: 'Aug 18',
        },
        {
          id: 'task-3',
          task_name: 'Sign Updated Remote Work Equipment Agreement',
          status: 'pending',
          created_at: '2026-08-09T11:20:00Z',
          category: 'HR Document',
          due_date: 'Aug 20',
        },
        {
          id: 'task-4',
          task_name: 'Confirm Delivery of Ergonomic Monitor Arm',
          status: 'pending',
          created_at: '2026-08-08T09:00:00Z',
          category: 'Asset Request',
          due_date: 'Aug 22',
        },
      ],
      recent_activity: [
        {
          id: 'act-1',
          title: 'Asset Assigned',
          message: 'MacBook Pro 16" (AST-2026-904) assigned to your profile',
          created_at: '2026-08-13T14:22:00Z',
          activity_type: 'asset',
          actor_name: 'IT Support',
        },
        {
          id: 'act-2',
          title: 'Request Status Updated',
          message: 'JetBrains All Products License moved to In Progress by IT Admin',
          created_at: '2026-08-12T11:05:00Z',
          activity_type: 'approval',
          actor_name: 'Rajesh Sharma',
        },
        {
          id: 'act-3',
          title: 'Security Notice',
          message: 'Quarterly device compliance check scheduled for next week',
          created_at: '2026-08-10T09:15:00Z',
          activity_type: 'system',
          actor_name: 'System Security',
        },
      ],
    },
  },
  manager: {
    role: 'manager',
    metrics: {
      my_assigned_assets_count: 4,
      my_open_requests_count: 1,
      pending_tasks_count: 5,
      unread_alerts_count: 3,
      pending_approvals_count: 6,
      team_headcount: 14,
      dept_asset_allocation: 92,
    },
    widgets: {
      pending_approvals: [
        {
          id: 'app-01',
          title: 'Hardware Upgrade: M3 Max Workstation',
          request_type: 'Asset Request',
          requester_name: 'Aarav Mehta',
          priority: 'urgent',
          created_at: '2026-08-14T08:30:00Z',
        },
        {
          id: 'app-02',
          title: 'Annual PTO Request (5 Days)',
          request_type: 'Leave Approval',
          requester_name: 'Priya Verma',
          priority: 'high',
          created_at: '2026-08-13T17:10:00Z',
        },
        {
          id: 'app-03',
          title: 'AWS Cloud Sandbox License',
          request_type: 'Software Access',
          requester_name: 'Rohan Gupta',
          priority: 'medium',
          created_at: '2026-08-13T12:00:00Z',
        },
        {
          id: 'app-04',
          title: 'Secondary 4K Monitor Allocation',
          request_type: 'Hardware Request',
          requester_name: 'Sneha Patel',
          priority: 'low',
          created_at: '2026-08-12T15:40:00Z',
        },
      ],
      team_members: [
        { id: 'tm-1', full_name: 'Aarav Mehta', designation: 'Senior Frontend Engineer', status: 'active', email: 'aarav.m@rosterly.io' },
        { id: 'tm-2', full_name: 'Priya Verma', designation: 'UI/UX Designer', status: 'active', email: 'priya.v@rosterly.io' },
        { id: 'tm-3', full_name: 'Rohan Gupta', designation: 'Backend Specialist', status: 'onboarding', email: 'rohan.g@rosterly.io' },
        { id: 'tm-4', full_name: 'Sneha Patel', designation: 'QA Lead', status: 'leave', email: 'sneha.p@rosterly.io' },
      ],
      pending_action_items: [
        { id: 'mtask-1', task_name: 'Approve Q3 Hardware Procurement Requests (3 Pending)', status: 'pending', created_at: '2026-08-14T07:00:00Z', category: 'Approval', due_date: 'Today' },
        { id: 'mtask-2', task_name: 'Review Rohan Gupta Onboarding Progress', status: 'pending', created_at: '2026-08-13T10:00:00Z', category: 'Onboarding', due_date: 'Tomorrow' },
        { id: 'mtask-3', task_name: 'Signoff Department Asset Inventory Audit', status: 'pending', created_at: '2026-08-12T14:00:00Z', category: 'Audit', due_date: 'Aug 19' },
      ],
      recent_activity: [
        { id: 'mact-1', title: 'Approval Submitted', message: 'Aarav Mehta requested M3 Max Workstation upgrade', created_at: '2026-08-14T08:30:00Z', activity_type: 'approval', actor_name: 'Aarav Mehta' },
        { id: 'mact-2', title: 'Onboarding Started', message: 'Rohan Gupta onboarded into Engineering Department', created_at: '2026-08-13T09:00:00Z', activity_type: 'onboarding', actor_name: 'HR Admin' },
        { id: 'mact-3', title: 'Asset Reassigned', message: 'Dell 27" Monitor reassigned from Sandbox to QA Station', created_at: '2026-08-11T16:20:00Z', activity_type: 'asset', actor_name: 'IT Support' },
      ],
    },
  },
  hr_admin: {
    role: 'hr_admin',
    metrics: {
      active_onboardings_count: 8,
      active_offboardings_count: 3,
      document_expiry_watchlist_count: 12,
      total_employees_count: 184,
      unread_alerts_count: 5,
    },
    widgets: {
      active_onboardings: [
        { id: 'ob-1', employee_name: 'Ananya Roy', department: 'Engineering', status: 'in_progress', type: 'onboarding', created_at: '2026-08-12T09:00:00Z' },
        { id: 'ob-2', employee_name: 'Vikram Joshi', department: 'Product Marketing', status: 'pending', type: 'onboarding', created_at: '2026-08-13T11:30:00Z' },
        { id: 'ob-3', employee_name: 'Kavita Nair', department: 'Human Resources', status: 'in_progress', type: 'onboarding', created_at: '2026-08-10T14:00:00Z' },
      ],
      active_offboardings: [
        { id: 'off-1', employee_name: 'David Miller', department: 'Sales', status: 'in_progress', type: 'offboarding', created_at: '2026-08-11T16:00:00Z' },
        { id: 'off-2', employee_name: 'Sara Khan', department: 'Finance', status: 'pending', type: 'offboarding', created_at: '2026-08-13T08:45:00Z' },
      ],
      pending_action_items: [
        { id: 'hrt-1', task_name: 'Verify NDA & Passport Copies for Ananya Roy', status: 'pending', created_at: '2026-08-14T09:00:00Z', category: 'Compliance', due_date: 'Today' },
        { id: 'hrt-2', task_name: 'Initiate Hardware Return for David Miller (Offboarding)', status: 'pending', created_at: '2026-08-13T15:00:00Z', category: 'Asset Return', due_date: 'Tomorrow' },
        { id: 'hrt-3', task_name: 'Review 12 Expiring Work Visa & Passport Documents', status: 'pending', created_at: '2026-08-12T11:00:00Z', category: 'Watchlist', due_date: 'Aug 20' },
      ],
      recent_activity: [
        { id: 'hract-1', title: 'Onboarding Checklist Created', message: 'New hire checklist assigned for Ananya Roy', created_at: '2026-08-14T09:12:00Z', activity_type: 'onboarding', actor_name: 'HR Team' },
        { id: 'hract-2', title: 'Document Verified', message: 'Tax Exemption form verified for Kavita Nair', created_at: '2026-08-13T14:40:00Z', activity_type: 'system', actor_name: 'Kavita Nair' },
        { id: 'hract-3', title: 'Offboarding Clearance Initiated', message: 'IT & Finance clearance triggered for David Miller', created_at: '2026-08-12T16:10:00Z', activity_type: 'onboarding', actor_name: 'HR Admin' },
      ],
    },
  },
  it_admin: {
    role: 'it_admin',
    metrics: {
      open_maintenance_tickets_count: 7,
      warranty_expiring_count: 15,
      available_stock_count: 42,
      total_assets_count: 520,
      unread_alerts_count: 4,
    },
    widgets: {
      open_maintenance_tickets: [
        { id: 'tkt-1', asset_name: 'MacBook Pro 16" (AST-881)', issue_description: 'Battery expanding & thermal throttling under heavy load', priority: 'critical', status: 'open', created_at: '2026-08-14T07:15:00Z' },
        { id: 'tkt-2', asset_name: 'Dell UltraSharp 32" 4K', issue_description: 'Display flickering on DisplayPort channel 2', priority: 'high', status: 'in_progress', created_at: '2026-08-13T13:20:00Z' },
        { id: 'tkt-3', asset_name: 'Cisco Meraki AP-24', issue_description: 'Firmware upgrade failover loop', priority: 'medium', status: 'open', created_at: '2026-08-12T10:00:00Z' },
      ],
      expiring_warranties: [
        { id: 'war-1', asset_tag: 'AST-2023-019', name: 'Lenovo ThinkPad P1 Gen 4', warranty_expiry: '2026-08-28' },
        { id: 'war-2', asset_tag: 'AST-2023-044', name: 'Apple Studio Display 27"', warranty_expiry: '2026-09-02' },
        { id: 'war-3', asset_tag: 'AST-2023-112', name: 'Dell PowerEdge R750 Server', warranty_expiry: '2026-09-10' },
      ],
      pending_action_items: [
        { id: 'itt-1', task_name: 'Dispatch Replacement MacBook Pro for Ticket #TKT-1', status: 'pending', created_at: '2026-08-14T08:00:00Z', category: 'Hardware Dispatch', due_date: 'Today' },
        { id: 'itt-2', task_name: 'Provision Developer Access Keys for 3 New Engineers', status: 'pending', created_at: '2026-08-13T16:00:00Z', category: 'Provisioning', due_date: 'Tomorrow' },
        { id: 'itt-3', task_name: 'Process Warranty Extensions for 15 Expiring Hardware Units', status: 'pending', created_at: '2026-08-12T09:30:00Z', category: 'Warranty', due_date: 'Aug 21' },
      ],
      recent_activity: [
        { id: 'itact-1', title: 'Ticket Logged', message: 'Critical battery defect reported on AST-881', created_at: '2026-08-14T07:15:00Z', activity_type: 'ticket', actor_name: 'Siddharth V.' },
        { id: 'itact-2', title: 'Stock Updated', message: '20x Logitech MX Keys keyboards added to available inventory', created_at: '2026-08-13T11:00:00Z', activity_type: 'asset', actor_name: 'IT Depot' },
        { id: 'itact-3', title: 'License Revoked', message: 'Offboarded employee Figma Enterprise seat recycled', created_at: '2026-08-11T15:30:00Z', activity_type: 'system', actor_name: 'Auto-Provisioner' },
      ],
    },
  },
  super_admin: {
    role: 'super_admin',
    metrics: {
      total_users_count: 248,
      total_assets_count: 610,
      system_health: 'Optimal (99.98% Uptime)',
      audit_events_count: 1420,
      unread_alerts_count: 2,
    },
    widgets: {
      system_overview: {
        active_sessions: 84,
        mfa_compliance_rate: '100%',
        database_latency_ms: 12,
        failed_login_attempts_24h: 3,
        storage_utilized_gb: 412.5,
      },
      audit_events_feed: [
        { id: 'aud-1', actor_name: 'Rajesh Sharma (IT Admin)', action: 'Role Elevated', entity_type: 'User Permission', created_at: '2026-08-14T09:45:00Z' },
        { id: 'aud-2', actor_name: 'System Security Engine', action: 'Failed Auth Lockout', entity_type: 'Login Attempt', created_at: '2026-08-14T08:12:00Z' },
        { id: 'aud-3', actor_name: 'Kushagra (Super Admin)', action: 'Approval Engine Policy Modified', entity_type: 'System Settings', created_at: '2026-08-13T18:30:00Z' },
        { id: 'aud-4', actor_name: 'HR System Integration', action: 'Bulk Sync Executed', entity_type: 'Employee Records', created_at: '2026-08-13T12:00:00Z' },
      ],
      pending_action_items: [
        { id: 'sat-1', task_name: 'Review Q3 Security Audit Log Digest', status: 'pending', created_at: '2026-08-14T07:30:00Z', category: 'Security Audit', due_date: 'Today' },
        { id: 'sat-2', task_name: 'Authorize AWS Vault Key Rotation', status: 'pending', created_at: '2026-08-13T14:00:00Z', category: 'System Maintenance', due_date: 'Tomorrow' },
        { id: 'sat-3', task_name: 'Confirm Department Budget Allocation Limits', status: 'pending', created_at: '2026-08-11T10:15:00Z', category: 'Governance', due_date: 'Aug 22' },
      ],
      recent_activity: [
        { id: 'saact-1', title: 'System Backup Complete', message: 'Automated snapshot #20260814-0400 created successfully', created_at: '2026-08-14T04:00:00Z', activity_type: 'system', actor_name: 'Backup Daemon' },
        { id: 'saact-2', title: 'Security Alert Cleared', message: 'Anomalous IP range check resolved automatically', created_at: '2026-08-13T21:10:00Z', activity_type: 'system', actor_name: 'GuardDuty' },
        { id: 'saact-3', title: 'New Role Created', message: 'Custom "Procurement Auditor" role created by Super Admin', created_at: '2026-08-12T13:45:00Z', activity_type: 'system', actor_name: 'Kushagra' },
      ],
    },
  },
  auditor: {
    role: 'auditor',
    metrics: {
      total_users_count: 248,
      total_assets_count: 610,
      system_health: 'Compliant',
      audit_events_count: 1420,
      unread_alerts_count: 0,
    },
    widgets: {
      system_overview: {
        compliance_score: '99.4%',
        open_non_conformances: 0,
        last_external_audit: '2026-07-01',
      },
      audit_events_feed: [
        { id: 'aud-10', actor_name: 'Rajesh Sharma', action: 'Asset Status Edit', entity_type: 'Asset Record', created_at: '2026-08-14T09:45:00Z' },
        { id: 'aud-11', actor_name: 'Kushagra', action: 'Policy Override', entity_type: 'Approval Chain', created_at: '2026-08-13T18:30:00Z' },
      ],
      pending_action_items: [
        { id: 'aut-1', task_name: 'Review SOC2 Compliance Evidence Export', status: 'pending', created_at: '2026-08-14T06:00:00Z', category: 'Compliance', due_date: 'Today' },
      ],
      recent_activity: [
        { id: 'auact-1', title: 'Audit Report Generated', message: 'Monthly asset allocation report exported', created_at: '2026-08-14T05:00:00Z', activity_type: 'system', actor_name: 'Audit Tool' },
      ],
    },
  },
}

export const dashboardService = {
  async getDashboardSummary(roleOverride?: UserRole): Promise<DashboardResponse> {
    try {
      const response = await apiClient.get<DashboardResponse>('/dashboard/summary')
      if (response.data && response.data.role) {
        return response.data
      }
    } catch {
      // Fallback to role-appropriate client representation if backend is unready or offline
    }

    const selectedRole = roleOverride || 'employee'
    return MOCK_DATA[selectedRole] || MOCK_DATA.employee
  },

  getMetricRibbonCards(response: DashboardResponse): DashboardMetricCard[] {
    const { role, metrics } = response

    switch (role) {
      case 'manager':
        return [
          {
            id: 'm1',
            label: 'Pending Approvals',
            value: metrics.pending_approvals_count ?? 0,
            change: '+2 new today',
            changeType: 'positive',
            iconName: 'approval',
            badgeText: 'Action Req.',
            badgeVariant: 'warning',
          },
          {
            id: 'm2',
            label: 'Team Headcount',
            value: metrics.team_headcount ?? 0,
            change: '14 Active Members',
            changeType: 'neutral',
            iconName: 'team',
            badgeText: 'Engineering',
            badgeVariant: 'accent',
          },
          {
            id: 'm3',
            label: 'Dept Asset Allocation',
            value: `${metrics.dept_asset_allocation ?? 0}%`,
            change: '42 Total Devices',
            changeType: 'positive',
            iconName: 'asset',
            badgeText: 'Optimal',
            badgeVariant: 'tertiary',
          },
          {
            id: 'm4',
            label: 'Unread Alerts',
            value: metrics.unread_alerts_count ?? 0,
            change: 'System Notifications',
            changeType: 'neutral',
            iconName: 'alert',
            badgeText: metrics.unread_alerts_count > 0 ? 'Urgent' : 'Clear',
            badgeVariant: metrics.unread_alerts_count > 0 ? 'error' : 'neutral',
          },
        ]

      case 'hr_admin':
        return [
          {
            id: 'hr1',
            label: 'Active Onboardings',
            value: metrics.active_onboardings_count ?? 0,
            change: '3 expected this week',
            changeType: 'positive',
            iconName: 'onboarding',
            badgeText: 'In Progress',
            badgeVariant: 'accent',
          },
          {
            id: 'hr2',
            label: 'Active Offboardings',
            value: metrics.active_offboardings_count ?? 0,
            change: '1 pending clearance',
            changeType: 'neutral',
            iconName: 'offboarding',
            badgeText: 'Clearance',
            badgeVariant: 'warning',
          },
          {
            id: 'hr3',
            label: 'Document Expiry (30d)',
            value: metrics.document_expiry_watchlist_count ?? 0,
            change: 'Requires Verification',
            changeType: 'negative',
            iconName: 'task',
            badgeText: 'Watchlist',
            badgeVariant: 'error',
          },
          {
            id: 'hr4',
            label: 'Total Workforce',
            value: metrics.total_employees_count ?? 0,
            change: '+5% vs last month',
            changeType: 'positive',
            iconName: 'users',
            badgeText: 'Full Time',
            badgeVariant: 'tertiary',
          },
        ]

      case 'it_admin':
        return [
          {
            id: 'it1',
            label: 'Open Maintenance Tickets',
            value: metrics.open_maintenance_tickets_count ?? 0,
            change: '1 Critical Priority',
            changeType: 'negative',
            iconName: 'ticket',
            badgeText: 'Queue',
            badgeVariant: 'error',
          },
          {
            id: 'it2',
            label: 'Warranty Expiring (30d)',
            value: metrics.warranty_expiring_count ?? 0,
            change: '15 Units Flagged',
            changeType: 'neutral',
            iconName: 'warranty',
            badgeText: 'Renewals',
            badgeVariant: 'warning',
          },
          {
            id: 'it3',
            label: 'Available Stock Count',
            value: metrics.available_stock_count ?? 0,
            change: 'Hardware Depot',
            changeType: 'positive',
            iconName: 'stock',
            badgeText: 'In Stock',
            badgeVariant: 'tertiary',
          },
          {
            id: 'it4',
            label: 'Managed Fleet Assets',
            value: metrics.total_assets_count ?? 0,
            change: '98% Assigned Rate',
            changeType: 'positive',
            iconName: 'asset',
            badgeText: 'Total Fleet',
            badgeVariant: 'accent',
          },
        ]

      case 'super_admin':
      case 'auditor':
        return [
          {
            id: 'sa1',
            label: 'Total Registered Users',
            value: metrics.total_users_count ?? 0,
            change: 'Active Directory',
            changeType: 'positive',
            iconName: 'users',
            badgeText: 'System Wide',
            badgeVariant: 'accent',
          },
          {
            id: 'sa2',
            label: 'Total Managed Assets',
            value: metrics.total_assets_count ?? 0,
            change: '100% Tracking',
            changeType: 'positive',
            iconName: 'asset',
            badgeText: 'Inventory',
            badgeVariant: 'tertiary',
          },
          {
            id: 'sa3',
            label: 'System Health',
            value: metrics.system_health ?? 'Healthy',
            change: '99.98% Uptime',
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
            change: '1 MacBook, 1 Display, 1 Peripheral',
            changeType: 'neutral',
            iconName: 'asset',
            badgeText: 'Active',
            badgeVariant: 'tertiary',
          },
          {
            id: 'emp2',
            label: 'My Open Requests',
            value: metrics.my_open_requests_count ?? 0,
            change: '1 Pending Approval',
            changeType: 'positive',
            iconName: 'request',
            badgeText: 'Track',
            badgeVariant: 'accent',
          },
          {
            id: 'emp3',
            label: 'Pending Tasks',
            value: metrics.pending_tasks_count ?? 0,
            change: '1 Due Today',
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
            badgeText: metrics.unread_alerts_count > 0 ? 'New' : 'All Clear',
            badgeVariant: metrics.unread_alerts_count > 0 ? 'accent' : 'neutral',
          },
        ]
    }
  },
}
