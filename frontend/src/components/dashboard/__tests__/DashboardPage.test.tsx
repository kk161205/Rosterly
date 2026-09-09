import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { DashboardPage } from '@/pages/DashboardPage'
import { dashboardService } from '@/services/dashboardService'
import { authService } from '@/services/authService'
import { onboardingService } from '@/services/onboardingService'
import { offboardingService } from '@/services/offboardingService'
import { DashboardResponse } from '@/types/dashboard'

vi.mock('@/services/authService', () => ({
  authService: {
    getCurrentUser: vi.fn(),
  },
}))

vi.mock('@/services/dashboardService', () => ({
  dashboardService: {
    getDashboardSummary: vi.fn(),
    getMetricRibbonCards: vi.fn(),
  },
}))

vi.mock('@/services/onboardingService', () => ({
  onboardingService: {
    updateChecklistItem: vi.fn().mockResolvedValue({}),
  },
}))

vi.mock('@/services/offboardingService', () => ({
  offboardingService: {
    updateChecklistItem: vi.fn().mockResolvedValue({}),
  },
}))

describe('DashboardPage Component (PRD §5.2)', () => {
  const mockEmployeeData: DashboardResponse = {
    role: 'employee',
    metrics: {
      my_assigned_assets_count: 2,
      my_open_requests_count: 1,
      pending_tasks_count: 3,
      unread_alerts_count: 0,
    },
    widgets: {
      my_assigned_assets: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          name: 'ThinkPad X1 Carbon',
          asset_tag: 'AST-001',
          category: 'laptop',
          serial_number: 'SN-TP-01',
          assigned_at: '2026-08-01T00:00:00Z',
        },
      ],
      my_open_requests: [
        {
          id: '22222222-2222-2222-2222-222222222222',
          title: 'Ergonomic Chair Request',
          request_type: 'asset_request',
          status: 'pending',
          priority: 'medium',
          created_at: '2026-08-10T00:00:00Z',
        },
      ],
      pending_action_items: [
        {
          id: '33333333-3333-3333-3333-333333333333',
          checklist_id: '55555555-5555-5555-5555-555555555555',
          checklist_type: 'onboarding',
          task_name: 'Verify Laptop Serial Number',
          status: 'pending',
          created_at: '2026-08-12T00:00:00Z',
        },
      ],
      recent_activity: [
        {
          id: '44444444-4444-4444-4444-444444444444',
          title: 'Asset Assigned',
          message: 'ThinkPad X1 assigned to you',
          created_at: '2026-08-13T00:00:00Z',
          activity_type: 'asset',
        },
      ],
    },
  }

  const mockMetricCards = [
    {
      id: 'emp1',
      label: 'My Assigned Assets',
      value: 2,
      iconName: 'asset' as const,
      badgeText: 'Active',
    },
    {
      id: 'emp2',
      label: 'My Open Requests',
      value: 1,
      iconName: 'request' as const,
      badgeText: 'Track',
    },
    {
      id: 'emp3',
      label: 'Pending Tasks',
      value: 3,
      iconName: 'task' as const,
      badgeText: 'Action',
    },
    {
      id: 'emp4',
      label: 'Unread Alerts',
      value: 0,
      iconName: 'alert' as const,
      badgeText: 'All Clear',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authService.getCurrentUser).mockResolvedValue({
      id: 'user-001',
      email: 'alex.chen@rosterly.example',
      full_name: 'Alex Chen',
      role: 'employee',
      permissions: [],
    })
    vi.mocked(dashboardService.getMetricRibbonCards).mockReturnValue(mockMetricCards)
  })

  it('renders employee dashboard with metrics, widgets, checklist and timeline', async () => {
    vi.mocked(dashboardService.getDashboardSummary).mockResolvedValueOnce(mockEmployeeData)

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Employee Workspace')).toBeInTheDocument()
      expect(screen.getByText('ThinkPad X1 Carbon')).toBeInTheDocument()
      expect(screen.getByText('Verify Laptop Serial Number')).toBeInTheDocument()
      expect(screen.getByText('ThinkPad X1 assigned to you')).toBeInTheDocument()
    })
  })

  it('renders error banner with retry button on API failure and allows retry', async () => {
    vi.mocked(dashboardService.getDashboardSummary)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(mockEmployeeData)

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(
        screen.getByText(/Unable to load live dashboard summary data from server/i)
      ).toBeInTheDocument()
    })

    const retryBtn = screen.getByRole('button', { name: /Retry Load/i })
    fireEvent.click(retryBtn)

    await waitFor(() => {
      expect(screen.getByText('Employee Workspace')).toBeInTheDocument()
      expect(screen.getByText('ThinkPad X1 Carbon')).toBeInTheDocument()
    })
  })

  it('allows toggling checklist items from pending to completed', async () => {
    // mockResolvedValue (not -Once): the completion handler refetches the summary
    // after persisting the change, so the mock must keep answering consistently.
    vi.mocked(dashboardService.getDashboardSummary).mockResolvedValue(mockEmployeeData)

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Verify Laptop Serial Number')).toBeInTheDocument()
    })

    const resolveBtn = screen.getByRole('button', { name: /Resolve/i })
    fireEvent.click(resolveBtn)

    // Generous timeout: this click triggers a mocked service call *and* a
    // full dashboard refetch (two Promise.allSettled legs) before the DOM
    // updates — under a loaded test-runner (many files/workers), the default
    // 1000ms waitFor window can occasionally be tight even though every
    // mock resolves on the next microtask, causing intermittent, order-
    // dependent flakiness that isn't reproducible in isolation.
    await waitFor(
      () => {
        expect(screen.getByText('Completed')).toBeInTheDocument()
      },
      { timeout: 3000 }
    )

    expect(onboardingService.updateChecklistItem).toHaveBeenCalledWith(
      '55555555-5555-5555-5555-555555555555',
      '33333333-3333-3333-3333-333333333333',
      'done'
    )
    expect(offboardingService.updateChecklistItem).not.toHaveBeenCalled()
  })

  it('dispatches offboarding-type pending action items to offboardingService, not onboardingService', async () => {
    // Regression test: pending_action_items can surface either checklist type
    // (same owner_role_id query backend-side) — completing an offboarding item
    // must run offboarding's asset-return side effect, not onboarding's logic.
    const offboardingItemData: DashboardResponse = {
      ...mockEmployeeData,
      widgets: {
        ...mockEmployeeData.widgets,
        pending_action_items: [
          {
            id: '33333333-3333-3333-3333-333333333333',
            checklist_id: '66666666-6666-6666-6666-666666666666',
            checklist_type: 'offboarding',
            task_name: 'Return Assigned Laptop',
            status: 'pending',
            created_at: '2026-08-12T00:00:00Z',
          },
        ],
      },
    }
    vi.mocked(dashboardService.getDashboardSummary).mockResolvedValue(offboardingItemData)

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Return Assigned Laptop')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Resolve/i }))

    await waitFor(
      () => {
        expect(offboardingService.updateChecklistItem).toHaveBeenCalledWith(
          '66666666-6666-6666-6666-666666666666',
          '33333333-3333-3333-3333-333333333333',
          'done'
        )
      },
      { timeout: 3000 }
    )
    expect(onboardingService.updateChecklistItem).not.toHaveBeenCalled()
  })
})
