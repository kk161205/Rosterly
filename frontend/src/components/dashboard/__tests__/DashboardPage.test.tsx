import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { DashboardPage } from '@/pages/DashboardPage'
import { dashboardService } from '@/services/dashboardService'
import { DashboardResponse } from '@/types/dashboard'

vi.mock('@/services/dashboardService', () => ({
  dashboardService: {
    getDashboardSummary: vi.fn(),
    getMetricRibbonCards: vi.fn(),
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
    vi.mocked(dashboardService.getDashboardSummary).mockResolvedValueOnce(mockEmployeeData)

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

    expect(screen.getByText('Completed')).toBeInTheDocument()
  })
})
