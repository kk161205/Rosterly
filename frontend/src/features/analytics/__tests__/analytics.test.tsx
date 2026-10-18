import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AnalyticsPage } from '@/features/analytics/pages/AnalyticsPage'
import { analyticsService } from '@/features/analytics/services/analyticsService'
import { formatDuration as duration } from '@/lib/format'
import { mockUser, renderPage } from '@/test/render'

vi.mock('@/features/auth/services/authService', () => ({ authService: { getCurrentUser: vi.fn() } }))
vi.mock('@/features/analytics/services/analyticsService', () => ({
  analyticsService: { savings: vi.fn(), costByDepartment: vi.fn(), budget: vi.fn(), followUps: vi.fn(), turnaround: vi.fn() },
}))

const ALL = ['analytics:savings', 'analytics:cost_by_department', 'analytics:budget_forecast', 'analytics:follow_ups', 'analytics:turnaround']

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(analyticsService.savings).mockResolvedValue({
    unused_licences: [
      { license_id: 'l1', name: 'Figma', vendor: 'Figma', total_seats: 10, assigned_seats: 6, unused_seats: 4, cost_per_seat: '5000', unused_cost_per_year: '20000', renewal_date: null },
    ],
    unused_licence_cost_per_year: '20000',
    idle_assets: [
      { asset_id: 'a1', asset_tag: 'AST-0007', name: 'Dell monitor', category: 'monitor', in_stock_since: '2026-05-01', days_idle: 170, current_value: '12000' },
    ],
    idle_asset_value: '12000',
    idle_threshold_days: 90,
  })
  vi.mocked(analyticsService.costByDepartment).mockResolvedValue([
    { department_id: 'd1', department_name: 'Engineering', hardware_cost: '900000', software_cost: '120000', total_cost: '1020000' },
  ])
  vi.mocked(analyticsService.budget).mockResolvedValue({
    past_end_of_life_count: 1,
    past_end_of_life_cost: '80000',
    replacements: [
      {
        label: 'Jan–Mar 2027', start: '2027-01-01', count: 1, replacement_cost: '150000',
        assets: [{ asset_id: 'a2', asset_tag: 'AST-0002', name: 'MacBook Pro', holder_name: 'Asha Rao', date: '2027-02-10', purchase_cost: '150000' }],
      },
    ],
    replacement_cost_12_months: '150000',
    warranties_expiring: [],
  })
  vi.mocked(analyticsService.followUps).mockResolvedValue({
    leavers: [
      { employee_id: 'e1', full_name: 'Logan Carter', date_of_exit: '2026-10-31', checklist_id: 'c1', assets: [{ asset_id: 'a3', asset_tag: 'AST-0010', name: 'ThinkPad', current_value: '98817' }] },
    ],
    unreturned_count: 1,
    unreturned_value: '98817',
    joiners_in_period: 2,
    joiners_ready_on_day_one: 1,
    upcoming_not_ready: [{ employee_id: 'e2', full_name: 'Ananya Iyer', date_of_joining: '2026-10-24', checklist_id: 'c2', open_tasks: 3 }],
  })
  vi.mocked(analyticsService.turnaround).mockResolvedValue({
    approval_median_hours: 4,
    approvals_by_step: [{ role_name: 'it_admin', decisions: 5, median_hours: 30 }],
    stuck_requests: [{ request_id: 'r1', title: 'Headset', waiting_on_role: 'it_admin', waiting_days: 6 }],
    stuck_threshold_days: 3,
    repair_median_hours: 20,
    repairs_by_priority: [],
    repeat_assets: [],
  })
})

describe('Analytics (§5.15)', () => {
  it('shows each total with a brief, not the records', async () => {
    mockUser('super_admin', ALL)
    renderPage(<AnalyticsPage />)
    expect(await screen.findByText('a year on licence seats nobody is using')).toBeInTheDocument()
    expect(screen.getByText('Most wasted: Figma, 4 of 10 seats unused (₹20,000/yr).')).toBeInTheDocument()
    expect(await screen.findByText('Engineering spent the most: ₹10,20,000 (100%).')).toBeInTheDocument()
    expect(await screen.findByText(/1 device is already past end of life/)).toBeInTheDocument()
    expect(await screen.findByText('Logan Carter holds 1 device, last day 31 Oct 2026.')).toBeInTheDocument()
    expect(screen.getByText('1 of 2')).toBeInTheDocument()
    expect(await screen.findByText('Slowest step: IT admin, 30 h.')).toBeInTheDocument()
    expect(screen.getByText(/1 request has been stuck for 3\+ days/)).toBeInTheDocument()
    // records stay in the panels until asked for
    expect(screen.queryByText('6 of 10 seats in use · 4 unused')).not.toBeInTheDocument()
    expect(screen.queryByText('Headset')).not.toBeInTheDocument()
  })

  it('opens the records behind a figure in a side panel', async () => {
    mockUser('super_admin', ['analytics:savings'])
    renderPage(<AnalyticsPage />)
    fireEvent.click(await screen.findByRole('button', { name: /See 1 device/ }))
    const panel = await screen.findByRole('dialog', { name: 'Idle equipment' })
    expect(within(panel).getByRole('link', { name: /Dell monitor/ })).toHaveAttribute('href', '/assets/a1')
    expect(within(panel).getByRole('button', { name: /Download CSV/ })).toBeInTheDocument()
  })

  it('hides the button when there is nothing behind the figure', async () => {
    mockUser('it_admin', ['analytics:budget_forecast'])
    renderPage(<AnalyticsPage />)
    expect(await screen.findByText('No warranties end in the next 90 days.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /warrant/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'See forecast by quarter' }))
    const panel = await screen.findByRole('dialog', { name: 'Replacement forecast' })
    expect(within(panel).getByRole('button', { name: /Jan–Mar 2027/ })).toHaveAttribute('aria-expanded', 'true')
    expect(within(panel).getByText('MacBook Pro')).toBeInTheDocument()
  })

  it('only asks for the reports the role may see', async () => {
    mockUser('hr_admin', ['analytics:cost_by_department', 'analytics:follow_ups'])
    renderPage(<AnalyticsPage />)
    await screen.findByText('Where the money went')
    expect(screen.queryByText('Money we can save')).not.toBeInTheDocument()
    expect(analyticsService.savings).not.toHaveBeenCalled()
    expect(analyticsService.budget).not.toHaveBeenCalled()
    expect(analyticsService.turnaround).not.toHaveBeenCalled()
  })

  it('one time range drives the period reports', async () => {
    mockUser('hr_admin', ['analytics:cost_by_department'])
    renderPage(<AnalyticsPage />)
    await screen.findByText('Where the money went')
    fireEvent.click(screen.getByRole('button', { name: '1 year' }))
    await waitFor(() => expect(analyticsService.costByDepartment).toHaveBeenCalledTimes(2))
    const [{ from, to }] = vi.mocked(analyticsService.costByDepartment).mock.calls[1]
    expect((new Date(to).getTime() - new Date(from).getTime()) / 86400000).toBeCloseTo(365, 0)
  })

  it('shows hours under two days, days after', () => {
    expect(duration(0.4)).toBe('under 1 h')
    expect(duration(20)).toBe('20 h')
    expect(duration(72)).toBe('3.0 days')
    expect(duration(null)).toBe('—')
  })
})
