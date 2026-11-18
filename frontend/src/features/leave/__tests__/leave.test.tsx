import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LeaveAttendancePage } from '@/features/leave/pages/LeaveAttendancePage'
import { leaveService } from '@/features/leave/services/leaveService'
import { attendanceService } from '@/features/leave/services/attendanceService'
import { mockUser, renderPage } from '@/test/render'

vi.mock('@/features/auth/services/authService', () => ({
  authService: { getCurrentUser: vi.fn() },
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

describe('Leave & Attendance (§5.20)', () => {
  const mockMyLeave = {
    items: [
      {
        id: 'leave-1',
        employee_id: 'me',
        leave_type: 'casual' as const,
        start_date: '2026-11-20',
        end_date: '2026-11-24',
        total_days: 3,
        status: 'approved' as const,
        approver_id: 'mgr-1',
        approver_name: 'Aditi Rao',
        reason: 'Family event',
        decision_comments: 'Enjoy the time off!',
        created_at: '2026-11-18T09:00:00.000Z',
        updated_at: '2026-11-18T10:00:00.000Z',
      },
    ],
    total: 1,
    page: 1,
    page_size: 25,
    balances: [
      { leave_type: 'sick' as const, year: 2026, balance_days: 10 },
      { leave_type: 'casual' as const, year: 2026, balance_days: 8 },
      { leave_type: 'earned' as const, year: 2026, balance_days: 15 },
      { leave_type: 'unpaid' as const, year: 2026, balance_days: 30 },
    ],
  }

  const mockPendingLeave = {
    items: [
      {
        id: 'leave-2',
        employee_id: 'emp-2',
        employee_name: 'Rohan Mehta',
        employee_email: 'rohan@rosterly.internal',
        leave_type: 'sick' as const,
        start_date: '2026-11-25',
        end_date: '2026-11-26',
        total_days: 2,
        status: 'pending' as const,
        reason: 'Doctor appointment',
        created_at: '2026-11-18T11:00:00.000Z',
        updated_at: '2026-11-18T11:00:00.000Z',
      },
    ],
    total: 1,
    page: 1,
    page_size: 25,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUser('manager', ['leave_request:approve'])

    vi.mocked(leaveService.getMyLeave).mockResolvedValue(mockMyLeave)
    vi.mocked(leaveService.getPendingApprovals).mockResolvedValue(mockPendingLeave)
    vi.mocked(attendanceService.list).mockResolvedValue({
      records: [],
      total: 0,
      page: 1,
      page_size: 100,
    })
  })

  it('renders top leave balance quota cards and attendance clock widget', async () => {
    renderPage(<LeaveAttendancePage />)

    expect(await screen.findByText('Leave & Attendance')).toBeInTheDocument()
    expect(screen.getByText('Sick Leave')).toBeInTheDocument()
    expect(screen.getByText('Casual Leave')).toBeInTheDocument()
    expect(screen.getByText('Earned Leave')).toBeInTheDocument()
    expect(screen.getByText('Unpaid Leave')).toBeInTheDocument()

    // Clock widget
    expect(screen.getByText('Check In')).toBeInTheDocument()
  })

  it('calculates dynamic business days in Apply Leave modal', async () => {
    renderPage(<LeaveAttendancePage />)

    const applyBtn = await screen.findByRole('button', { name: /Apply for Leave/i })
    fireEvent.click(applyBtn)

    expect(await screen.findByText('Submit Leave Request')).toBeInTheDocument()

    const startInput = screen.getByLabelText(/Start Date/i)
    const endInput = screen.getByLabelText(/End Date/i)

    // Friday 2026-11-20 to Monday 2026-11-23 (2 business days: Friday & Monday)
    fireEvent.change(startInput, { target: { value: '2026-11-20' } })
    fireEvent.change(endInput, { target: { value: '2026-11-23' } })

    expect(await screen.findByText('2 business days')).toBeInTheDocument()
  })

  it('shows team coverage tab and pending approvals queue for manager', async () => {
    renderPage(<LeaveAttendancePage />)

    const teamTab = await screen.findByRole('tab', { name: /Team Coverage & Approvals/i })
    fireEvent.click(teamTab)

    expect(await screen.findByText('Team Out-of-Office Schedule')).toBeInTheDocument()
    const rohanElements = await screen.findAllByText('Rohan Mehta')
    expect(rohanElements.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Doctor appointment')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Approve/i }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('button', { name: /Reject/i })).toBeInTheDocument()
  })

  it('allows manager to approve a pending leave request', async () => {
    vi.mocked(leaveService.approve).mockResolvedValueOnce({
      ...mockPendingLeave.items[0],
      status: 'approved',
    })

    renderPage(<LeaveAttendancePage />)

    const teamTab = await screen.findByRole('tab', { name: /Team Coverage & Approvals/i })
    fireEvent.click(teamTab)

    const approveButtons = await screen.findAllByRole('button', { name: /^Approve$/i })
    fireEvent.click(approveButtons[0])

    expect(await screen.findByText('Approve Leave for Rohan Mehta')).toBeInTheDocument()

    const confirmBtn = screen.getByRole('button', { name: 'Approve Request' })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(leaveService.approve).toHaveBeenCalledWith('leave-2', expect.anything())
    })
  })
})
