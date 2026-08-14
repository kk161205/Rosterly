export type UserRole = 'employee' | 'manager' | 'hr_admin' | 'it_admin' | 'super_admin' | 'auditor'

export interface AssignedAssetItem {
  id: string
  name: string
  asset_tag: string
  category: string
  serial_number?: string | null
  assigned_at?: string | null
}

export interface RequestItem {
  id: string
  title: string
  request_type: string
  status: 'pending' | 'approved' | 'rejected' | 'in_progress' | 'completed'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  created_at: string
}

export interface PendingApprovalItem {
  id: string
  title: string
  request_type: string
  requester_name: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  created_at: string
}

export interface TaskChecklistItem {
  id: string
  task_name: string
  status: 'pending' | 'in_progress' | 'completed'
  created_at: string
  category?: string
  due_date?: string
}

export interface ActivityTimelineItem {
  id: string
  title: string
  message: string
  created_at: string
  activity_type?: 'asset' | 'approval' | 'onboarding' | 'ticket' | 'system'
  actor_name?: string
}

export interface TeamMemberItem {
  id: string
  full_name: string
  designation: string
  status: 'active' | 'onboarding' | 'leave' | 'inactive'
  email: string
}

export interface OnboardingOffboardingItem {
  id: string
  employee_name: string
  department?: string | null
  status: 'pending' | 'in_progress' | 'completed'
  type: 'onboarding' | 'offboarding'
  created_at: string
}

export interface MaintenanceTicketItem {
  id: string
  asset_name: string
  issue_description: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  created_at: string
}

export interface ExpiringWarrantyItem {
  id: string
  asset_tag: string
  name: string
  warranty_expiry?: string | null
}

export interface AuditEventItem {
  id: string
  actor_name: string
  action: string
  entity_type: string
  created_at: string
}

export interface DashboardMetricCard {
  id: string
  label: string
  value: number | string
  change?: string
  changeType?: 'positive' | 'negative' | 'neutral'
  iconName: 'asset' | 'request' | 'task' | 'alert' | 'approval' | 'team' | 'onboarding' | 'offboarding' | 'ticket' | 'warranty' | 'users' | 'health' | 'audit' | 'stock'
  badgeText?: string
  badgeVariant?: 'accent' | 'tertiary' | 'warning' | 'error' | 'neutral'
}

export interface DashboardResponse {
  role: UserRole
  metrics: Record<string, any>
  widgets: Record<string, any>
}
