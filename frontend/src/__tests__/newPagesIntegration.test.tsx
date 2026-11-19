import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderPage, mockUser, IT_ADMIN } from '@/test/render'
import { NotificationCenterPage } from '@/features/notifications/pages/NotificationCenterPage'
import { AuditLogViewerPage } from '@/features/audit/pages/AuditLogViewerPage'
import { ApprovalChainConfigPage } from '@/features/approvalChains/pages/ApprovalChainConfigPage'
import { SoftwareLicensesPage } from '@/features/licenses/pages/SoftwareLicensesPage'
import { LeaveAttendancePage } from '@/features/leave/pages/LeaveAttendancePage'
import { notificationService } from '@/features/notifications/services/notificationService'
import { auditService } from '@/features/audit/services/auditService'
import { approvalChainService } from '@/features/approvalChains/services/approvalChainService'
import { licenseService } from '@/features/licenses/services/licenseService'
import { leaveService } from '@/features/leave/services/leaveService'
import { attendanceService } from '@/features/leave/services/attendanceService'

vi.mock('@/features/auth/services/authService', () => ({
  authService: { getCurrentUser: vi.fn() },
}))

vi.mock('@/features/notifications/services/notificationService', () => ({
  notificationService: {
    list: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
}))

vi.mock('@/features/audit/services/auditService', () => ({
  auditService: {
    list: vi.fn(),
  },
}))

vi.mock('@/features/approvalChains/services/approvalChainService', () => ({
  approvalChainService: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getAssignableRoles: vi.fn(),
  },
}))

vi.mock('@/features/licenses/services/licenseService', () => ({
  licenseService: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    getHolders: vi.fn(),
  },
}))

vi.mock('@/features/leave/services/leaveService', () => ({
  leaveService: {
    getMyLeave: vi.fn(),
    getPendingApprovals: vi.fn(),
    apply: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
  },
}))

vi.mock('@/features/leave/services/attendanceService', () => ({
  attendanceService: {
    list: vi.fn(),
    checkIn: vi.fn(),
    checkOut: vi.fn(),
  },
}))

describe('Pages 5.16 through 5.20 Integration Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUser('super_admin', [
      ...IT_ADMIN,
      'audit_log:read',
      'approval_chain:read',
      'approval_chain:create',
      'software_license:read',
      'software_license:create',
      'leave:read',
      'leave:apply',
    ])

    vi.mocked(notificationService.list).mockResolvedValue({
      items: [
        {
          id: 'notif-1',
          type: 'approval_needed',
          title: 'Integration Test Notification',
          message: 'All new pages are verified',
          related_entity_type: 'request',
          related_entity_id: 'req-1',
          is_critical: false,
          is_read: false,
          created_at: new Date().toISOString(),
        },
      ],
      total: 1,
      unread_count: 1,
    })

    vi.mocked(auditService.list).mockResolvedValue({
      items: [
        {
          id: 'aud-101',
          actor: {
            id: 'usr-1',
            full_name: 'Priya Patel',
            email: 'admin@rosterly.internal',
          },
          action: 'role_assigned',
          entity_type: 'user',
          entity_id: 'usr-202',
          before_state: { role: 'employee' },
          after_state: { role: 'manager', department: 'Engineering' },
          ip_address: '192.168.1.50',
          created_at: new Date().toISOString(),
        },
      ],
      total: 1,
    })

    vi.mocked(approvalChainService.list).mockResolvedValue({
      templates: [
        {
          id: 'chain-1',
          request_type: 'asset_request',
          name: 'Hardware Requisition Flow',
          min_amount: 50000,
          is_active: true,
          steps: [
            { step_order: 1, approver_role_id: 'r-mgr', approver_role_name: 'manager' },
            { step_order: 2, approver_role_id: 'r-it', approver_role_name: 'it_admin' },
          ],
          pending_request_count: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    })
    vi.mocked(approvalChainService.getAssignableRoles).mockResolvedValue([
      { id: 'r-mgr', name: 'manager', description: null, is_system_role: true },
      { id: 'r-it', name: 'it_admin', description: null, is_system_role: true },
    ])

    vi.mocked(licenseService.list).mockResolvedValue({
      items: [
        {
          id: 'lic-1',
          name: 'Figma Enterprise',
          vendor: 'Figma Inc.',
          total_seats: 50,
          seats_used: 40,
          cost_per_seat: 45,
          renewal_date: '2026-12-31',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      total: 1,
    })

    vi.mocked(leaveService.getMyLeave).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 20,
      balances: [
        { leave_type: 'sick', year: 2026, balance_days: 12 },
        { leave_type: 'casual', year: 2026, balance_days: 12 },
        { leave_type: 'earned', year: 2026, balance_days: 18 },
        { leave_type: 'unpaid', year: 2026, balance_days: 0 },
      ],
    })

    vi.mocked(leaveService.getPendingApprovals).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 20,
    })

    vi.mocked(attendanceService.list).mockResolvedValue({
      records: [],
      total: 0,
      page: 1,
      page_size: 31,
    })
  })

  it('renders §5.16 Notifications Center successfully', async () => {
    renderPage(<NotificationCenterPage />, { route: '/notifications' })
    expect(await screen.findByText('Notifications')).toBeInTheDocument()
    expect(await screen.findByText('Integration Test Notification')).toBeInTheDocument()
  })

  it('renders §5.17 Audit Log Viewer successfully', async () => {
    renderPage(<AuditLogViewerPage />, { route: '/audit-logs' })
    expect(await screen.findByText('Audit Log')).toBeInTheDocument()
    expect(await screen.findByText('admin@rosterly.internal')).toBeInTheDocument()
  })

  it('renders §5.18 Approval Chains Configuration successfully', async () => {
    renderPage(<ApprovalChainConfigPage />, { route: '/approval-chains' })
    expect(await screen.findByText('Approval Chains')).toBeInTheDocument()
    expect(await screen.findByText('Hardware Requisition Flow')).toBeInTheDocument()
  })

  it('renders §5.19 Software License Management successfully', async () => {
    renderPage(<SoftwareLicensesPage />, { route: '/licenses' })
    expect(await screen.findByText('Software Licences')).toBeInTheDocument()
    expect(await screen.findByText('Figma Enterprise')).toBeInTheDocument()
  })

  it('renders §5.20 Leave & Attendance Page successfully', async () => {
    renderPage(<LeaveAttendancePage />, { route: '/leave' })
    expect(await screen.findByText('Leave & Attendance')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('Sick Leave')).toBeInTheDocument()
    })
  })
})
