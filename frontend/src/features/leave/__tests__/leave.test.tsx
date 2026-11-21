import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LeaveAttendancePage } from '@/features/leave/pages/LeaveAttendancePage'
import { leaveService } from '@/features/leave/services/leaveService'
import { attendanceService } from '@/features/leave/services/attendanceService'
import { workingDays } from '@/features/leave/lib/workingDays'
import type { LeaveRequestResponse } from '@/features/leave/types/leave'
import { mockUser, renderPage } from '@/test/render'

vi.mock('@/features/auth/services/authService', () => ({ authService: { getCurrentUser: vi.fn() } }))
vi.mock('@/features/admin/services/companySettingsService', () => {
  const data = [{ key: 'attendance.manual_check_in', value: true, can_edit: false }]
  return {
    COMPANY_SETTINGS_KEY: ['company-settings'],
    companySettingsService: { list: vi.fn().mockResolvedValue(data), update: vi.fn() },
    useCompanySettings: () => ({ data, isLoading: false, isError: false }),
    settingValue: (settings: { key: string; value: unknown }[] | undefined, key: string) => settings?.find((s) => s.key === key)?.value,
  }
})
vi.mock('@/features/leave/services/leaveService', () => ({
  leaveService: {
    getMyLeave: vi.fn(),
    getPendingApprovals: vi.fn(),
    getTeam: vi.fn(),
    getLeaveTypes: vi.fn(),
    getHolidays: vi.fn(),
    addHoliday: vi.fn(),
    apply: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    cancel: vi.fn(),
  },
}))
vi.mock('@/features/leave/services/attendanceService', () => ({
  attendanceService: { list: vi.fn(), checkIn: vi.fn(), checkOut: vi.fn() },
}))

const sick = { id: 't-sick', name: 'Sick leave', is_paid: true, unlimited: false }
const unpaid = { id: 't-unpaid', name: 'Unpaid leave', is_paid: false, unlimited: true }

const leave = (over: Partial<LeaveRequestResponse> = {}): LeaveRequestResponse => ({
  id: 'leave-1',
  employee_id: 'me',
  employee_name: 'Test User',
  leave_type: sick,
  start_date: '2099-03-02',
  end_date: '2099-03-04',
  total_days: 3,
  status: 'pending',
  approver_id: null,
  approver_name: null,
  reason: 'Unwell',
  decision_comments: null,
  can_cancel: true,
  created_at: '2099-02-20T09:00:00Z',
  updated_at: '2099-02-20T09:00:00Z',
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(leaveService.getMyLeave).mockResolvedValue({
    items: [leave()],
    total: 1,
    page: 1,
    page_size: 25,
    balances: [
      { leave_type: sick, year: 2099, annual_days: '12', balance_days: '5', pending_days: '3' },
      { leave_type: unpaid, year: 2099, annual_days: null, balance_days: null, pending_days: '0' },
    ],
  })
  vi.mocked(leaveService.getPendingApprovals).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 25 })
  vi.mocked(leaveService.getTeam).mockResolvedValue({ items: [] })
  vi.mocked(leaveService.getLeaveTypes).mockResolvedValue([
    { id: 't-sick', name: 'Sick leave', annual_days: '12', carry_forward_max: '0', is_paid: true, pro_rate_on_join: true, is_active: true, sort_order: 1 },
    { id: 't-unpaid', name: 'Unpaid leave', annual_days: null, carry_forward_max: '0', is_paid: false, pro_rate_on_join: true, is_active: true, sort_order: 2 },
  ])
  vi.mocked(leaveService.getHolidays).mockResolvedValue([{ id: 'h1', date: '2099-03-03', name: 'Festival' }])
  vi.mocked(attendanceService.list).mockResolvedValue({ records: [], total: 0, page: 1, page_size: 25 })
})

describe('working days', () => {
  it('skips weekends and holidays, in local time', () => {
    expect(workingDays('2026-06-05', '2026-06-08')).toBe(2) // Fri → Mon
    expect(workingDays('2026-06-08', '2026-06-12', ['2026-06-10'])).toBe(4)
    expect(workingDays('2026-06-06', '2026-06-07')).toBe(0)
    expect(workingDays('2026-06-10', '2026-06-08')).toBe(0)
  })
})

describe('Leave', () => {
  it('shows real balances from the company’s leave types, and today’s check-in', async () => {
    mockUser('employee', [])
    renderPage(<LeaveAttendancePage />)
    const balances = await screen.findByRole('region', { name: 'Your leave this year' })
    expect(within(balances).getByText('5 days left')).toBeInTheDocument()
    expect(within(balances).getByText(/3 days waiting for approval/)).toBeInTheDocument()
    expect(within(balances).getByText('No limit')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Check in' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /Settings/ })).not.toBeInTheDocument()
  })

  it('counts working days without the holiday and stops requests over the balance', async () => {
    mockUser('employee', [])
    renderPage(<LeaveAttendancePage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ask for leave' }))
    const dialog = await screen.findByRole('dialog', { name: 'Ask for leave' })
    await within(dialog).findByRole('option', { name: 'Sick leave' })
    fireEvent.change(within(dialog).getByLabelText('Type of leave'), { target: { value: 't-sick' } })
    fireEvent.change(within(dialog).getByLabelText('First day'), { target: { value: '2099-03-02' } })
    fireEvent.change(within(dialog).getByLabelText('Last day'), { target: { value: '2099-03-04' } })
    expect(await within(dialog).findByText(/2 working days/)).toBeInTheDocument() // Wed is a holiday
    expect(within(dialog).getByRole('button', { name: 'Send request' })).toBeEnabled()

    fireEvent.change(within(dialog).getByLabelText('Last day'), { target: { value: '2099-03-09' } })
    expect(await within(dialog).findByText(/more than you have left/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Send request' })).toBeDisabled()
  })

  it('lets you cancel your own pending leave', async () => {
    mockUser('employee', [])
    vi.mocked(leaveService.cancel).mockResolvedValue(leave({ status: 'cancelled', can_cancel: false }))
    renderPage(<LeaveAttendancePage />)
    const table = await screen.findByRole('table', { name: /My leave/ })
    fireEvent.click(within(table).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(leaveService.cancel).toHaveBeenCalledWith('leave-1'))
  })

  it('shows approvers who’s off and what’s waiting', async () => {
    mockUser('manager', ['leave_request:approve'])
    vi.mocked(leaveService.getPendingApprovals).mockResolvedValue({
      items: [leave({ id: 'p1', employee_id: 'u2', employee_name: 'Rahul Verma', can_cancel: false })],
      total: 1,
      page: 1,
      page_size: 25,
    })
    renderPage(<LeaveAttendancePage />)
    fireEvent.mouseDown(await screen.findByRole('tab', { name: /Team · 1 waiting/ }))
    expect(await screen.findByRole('heading', { name: 'Who’s off in the next two weeks' })).toBeInTheDocument()
    expect(await screen.findByText('Rahul Verma')).toBeInTheDocument()
    expect(leaveService.getTeam).toHaveBeenCalled()
  })

  it('gives HR a settings tab', async () => {
    mockUser('hr_admin', ['leave_request:approve', 'leave_policy:manage'])
    renderPage(<LeaveAttendancePage />)
    expect(await screen.findByRole('tab', { name: 'Settings' })).toBeInTheDocument()
  })

  it('shows the year a new holiday was added to', async () => {
    mockUser('hr_admin', ['leave_request:approve', 'leave_policy:manage'])
    vi.mocked(leaveService.addHoliday).mockResolvedValue({ id: 'h2', date: '2099-01-26', name: 'Republic Day' })
    renderPage(<LeaveAttendancePage />)
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Settings' }))
    await screen.findByText('Company holidays')
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2099-01-26' } })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Republic Day' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add holiday' }))
    await waitFor(() => expect(leaveService.getHolidays).toHaveBeenLastCalledWith(2099))
    expect(screen.getByLabelText('Year')).toHaveValue('2099')
  })
})
