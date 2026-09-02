import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { OffboardingWorkflowPage } from '@/pages/OffboardingWorkflowPage'
import { offboardingService } from '@/services/offboardingService'
import { authService } from '@/services/authService'
import { employeeService } from '@/services/employeeService'
import { OffboardingChecklist, OffboardingSummaryMetrics } from '@/types/offboarding'

vi.mock('@/services/authService', () => ({
  authService: {
    getCurrentUser: vi.fn(),
  },
}))

vi.mock('@/services/offboardingService', () => ({
  offboardingService: {
    getOffboardings: vi.fn(),
    getOffboardingById: vi.fn(),
    createOffboarding: vi.fn(),
    updateChecklistItem: vi.fn(),
    completeOffboarding: vi.fn(),
    getSummaryMetrics: vi.fn(),
  },
}))

vi.mock('@/services/employeeService', () => ({
  employeeService: {
    getEmployees: vi.fn(),
  },
}))

describe('OffboardingWorkflowPage Component', () => {
  const mockMetrics: OffboardingSummaryMetrics = {
    total_active_offboardings: 2,
    pending_asset_reclamations: 3,
    pending_access_revocations: 2,
    completed_offboardings: 5,
    avg_completion_days: 4,
  }

  const mockChecklists: OffboardingChecklist[] = [
    {
      id: 'chk-off-101',
      employee_id: 'emp-201',
      employee_name: 'Marcus Vance',
      employee_email: 'marcus.vance@rosterly.io',
      employee_designation: 'Senior Infrastructure Engineer',
      department_name: 'Engineering',
      exit_date: '2026-09-15',
      reason: 'Career transition',
      type: 'offboarding',
      status: 'in_progress',
      created_at: '2026-08-25T10:00:00Z',
      updated_at: '2026-08-28T15:30:00Z',
      progress_percentage: 50,
      total_items: 4,
      completed_items: 2,
      items: [
        {
          id: 'item-1',
          checklist_id: 'chk-off-101',
          task_name: 'Retrieve Asset: MacBook Pro 16 (AST-0102)',
          owner_role_id: 'role-it-admin',
          owner_role_name: 'it_admin',
          asset_assignment_id: 'assign-1',
          status: 'done',
          completed_by_name: 'David IT Admin',
          completed_at: '2026-08-26T11:30:00Z',
          sort_order: 1,
          created_at: '2026-08-25T10:00:00Z',
        },
        {
          id: 'item-2',
          checklist_id: 'chk-off-101',
          task_name: 'Revoke System Access & Deactivate SSO Credentials',
          owner_role_id: 'role-it-admin',
          owner_role_name: 'it_admin',
          status: 'in_progress',
          sort_order: 2,
          created_at: '2026-08-25T10:00:00Z',
        },
        {
          id: 'item-3',
          checklist_id: 'chk-off-101',
          task_name: 'Conduct Exit Interview & Collect Feedback',
          owner_role_id: 'role-hr-admin',
          owner_role_name: 'hr_admin',
          status: 'done',
          completed_by_name: 'Sarah HR Admin',
          completed_at: '2026-08-27T09:00:00Z',
          sort_order: 3,
          created_at: '2026-08-25T10:00:00Z',
        },
        {
          id: 'item-4',
          checklist_id: 'chk-off-101',
          task_name: 'Settle Final Pay, Expenses & Benefits Clearance',
          owner_role_id: 'role-hr-admin',
          owner_role_name: 'hr_admin',
          status: 'pending',
          sort_order: 4,
          created_at: '2026-08-25T10:00:00Z',
        },
      ],
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authService.getCurrentUser).mockResolvedValue({
      id: 'usr-admin-1',
      full_name: 'Super Administrator',
      email: 'admin@rosterly.io',
      role: 'super_admin',
    })
    vi.mocked(offboardingService.getOffboardings).mockResolvedValue({
      checklists: mockChecklists,
      total: 1,
    })
    vi.mocked(offboardingService.getSummaryMetrics).mockResolvedValue(mockMetrics)
    vi.mocked(employeeService.getEmployees).mockResolvedValue({
      items: [
        {
          id: 'emp-301',
          employee_code: 'RST-0301',
          full_name: 'Emma Watson',
          email: 'emma.watson@rosterly.io',
          designation: 'Product Lead',
          department_name: 'Product',
          status: 'active',
          role: 'employee',
          date_of_joining: '2024-01-10',
        },
      ],
      total: 1,
      page: 1,
      page_size: 100,
    })
  })

  it('renders offboarding workflow header, metric ribbon, and active employee gauge', async () => {
    render(
      <MemoryRouter>
        <OffboardingWorkflowPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Offboarding Workflow Governance')).toBeInTheDocument()
      expect(screen.getByText('Active Offboardings')).toBeInTheDocument()
      expect(screen.getByText('Assets to Reclaim')).toBeInTheDocument()
      expect(screen.getByText('Access Revocations')).toBeInTheDocument()
      expect(screen.getByText('Completed Exits')).toBeInTheDocument()
    })

    expect(screen.getByText('Marcus Vance')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('renders warning banner and task board columns', async () => {
    render(
      <MemoryRouter>
        <OffboardingWorkflowPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Active Offboarding In-Flight')).toBeInTheDocument()
      expect(screen.getByText('Hardware & Asset Reclamation')).toBeInTheDocument()
      expect(screen.getByText('System & SSO Revocation')).toBeInTheDocument()
      expect(screen.getByText('Exit & Financial Settlement')).toBeInTheDocument()
    })

    expect(
      screen.getByText('Retrieve Asset: MacBook Pro 16 (AST-0102)')
    ).toBeInTheDocument()
    expect(
      screen.getByText('Revoke System Access & Deactivate SSO Credentials')
    ).toBeInTheDocument()
  })

  it('allows updating a checklist task item status', async () => {
    vi.mocked(offboardingService.updateChecklistItem).mockResolvedValue({
      id: 'item-2',
      checklist_id: 'chk-off-101',
      task_name: 'Revoke System Access & Deactivate SSO Credentials',
      owner_role_id: 'role-it-admin',
      owner_role_name: 'it_admin',
      status: 'done',
      completed_by: 'usr-admin-1',
      completed_by_name: 'Super Administrator',
      completed_at: new Date().toISOString(),
      sort_order: 2,
      created_at: '2026-08-25T10:00:00Z',
    })

    render(
      <MemoryRouter>
        <OffboardingWorkflowPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(
        screen.getByText('Revoke System Access & Deactivate SSO Credentials')
      ).toBeInTheDocument()
    })

    const markDoneButtons = screen.getAllByRole('button', { name: /mark done/i })
    expect(markDoneButtons.length).toBeGreaterThan(0)
    fireEvent.click(markDoneButtons[0])

    await waitFor(() => {
      expect(offboardingService.updateChecklistItem).toHaveBeenCalled()
    })
  })

  it('opens and submits start offboarding modal', async () => {
    vi.mocked(offboardingService.createOffboarding).mockResolvedValue({
      id: 'chk-new-1',
      employee_id: 'emp-301',
      type: 'offboarding',
      status: 'in_progress',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      progress_percentage: 0,
      total_items: 4,
      completed_items: 0,
      items: [],
    })

    render(
      <MemoryRouter>
        <OffboardingWorkflowPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start offboarding/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /start offboarding/i }))

    await waitFor(() => {
      expect(screen.getByText('Initiate Employee Offboarding')).toBeInTheDocument()
    })

    const kickoffBtn = screen.getByRole('button', { name: /kickoff offboarding/i })
    fireEvent.click(kickoffBtn)

    await waitFor(() => {
      expect(offboardingService.createOffboarding).toHaveBeenCalled()
    })
  })

  it('renders empty state when no offboardings exist', async () => {
    vi.mocked(offboardingService.getOffboardings).mockResolvedValue({
      checklists: [],
      total: 0,
    })

    render(
      <MemoryRouter>
        <OffboardingWorkflowPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('No Offboarding Workflows Found')).toBeInTheDocument()
    })
  })
})
