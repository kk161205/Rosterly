import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { OnboardingWorkflowPage } from '@/pages/OnboardingWorkflowPage'
import { onboardingService } from '@/services/onboardingService'
import { authService } from '@/services/authService'
import { OnboardingChecklist, OnboardingSummaryMetrics } from '@/types/onboarding'

vi.mock('@/services/authService', () => ({
  authService: {
    getCurrentUser: vi.fn(),
  },
}))

vi.mock('@/services/onboardingService', () => ({
  onboardingService: {
    getOnboardings: vi.fn(),
    getOnboardingById: vi.fn(),
    createOnboarding: vi.fn(),
    updateChecklistItem: vi.fn(),
    suggestChecklistWithAI: vi.fn(),
    getSummaryMetrics: vi.fn(),
    getEligibleEmployees: vi.fn(),
  },
}))

describe('OnboardingWorkflowPage Component (§5.5)', () => {
  const mockMetrics: OnboardingSummaryMetrics = {
    total_active_onboardings: 2,
    pending_it_tasks: 3,
    pending_hr_tasks: 1,
    avg_completion_days: 3.2,
    completion_rate: 75,
  }

  const mockChecklists: OnboardingChecklist[] = [
    {
      id: 'chk-101',
      employee_id: 'emp-201',
      employee_name: 'Alex Rivera',
      employee_email: 'alex.rivera@rosterly.io',
      employee_designation: 'Senior Frontend Engineer',
      department_name: 'Engineering',
      joining_date: '2026-09-01',
      type: 'onboarding',
      status: 'in_progress',
      created_at: '2026-08-20T10:00:00Z',
      updated_at: '2026-08-24T15:30:00Z',
      progress_percentage: 50,
      total_items: 4,
      completed_items: 2,
      items: [
        {
          id: 'item-1',
          checklist_id: 'chk-101',
          task_name: 'Issue Employment Contract & NDA',
          owner_role_id: 'role-hr-admin',
          owner_role_name: 'hr_admin',
          status: 'done',
          completed_by_name: 'Sarah Connor',
          completed_at: '2026-08-20T11:30:00Z',
          sort_order: 1,
          created_at: '2026-08-20T10:00:00Z',
        },
        {
          id: 'item-2',
          checklist_id: 'chk-101',
          task_name: 'Provision Laptop & Peripherals',
          owner_role_id: 'role-it-admin',
          owner_role_name: 'it_admin',
          status: 'in_progress',
          sort_order: 2,
          created_at: '2026-08-20T10:00:00Z',
        },
        {
          // "Facilities" has no seed role (RBAC §3.1) — the real backend attributes
          // workspace/access tasks to hr_admin, distinguished on the frontend by a
          // task-name keyword match (see OnboardingTaskBoard.tsx).
          id: 'item-3',
          checklist_id: 'chk-101',
          task_name: 'Issue Building Access Keycard',
          owner_role_id: 'role-hr-admin',
          owner_role_name: 'hr_admin',
          status: 'pending',
          sort_order: 3,
          created_at: '2026-08-20T10:00:00Z',
        },
        {
          id: 'item-4',
          checklist_id: 'chk-101',
          task_name: 'Schedule Team 1:1 Intro',
          owner_role_id: 'role-hr-admin',
          owner_role_name: 'hr_admin',
          status: 'pending',
          sort_order: 4,
          created_at: '2026-08-20T10:00:00Z',
        },
      ],
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authService.getCurrentUser).mockResolvedValue({
      id: 'usr-hr-1',
      email: 'hr@rosterly.example',
      full_name: 'Sarah Connor',
      role: 'hr_admin',
    })
    vi.mocked(onboardingService.getOnboardings).mockResolvedValue({
      checklists: mockChecklists,
      total: 1,
    })
    vi.mocked(onboardingService.getSummaryMetrics).mockResolvedValue(mockMetrics)
    vi.mocked(onboardingService.getEligibleEmployees).mockResolvedValue([
      { id: 'emp-301', name: 'Priya Sharma', designation: 'UI/UX Designer', department: 'Product Design' },
    ])
  })

  it('renders onboarding workflow header, metric ribbon, and active employee gauge', async () => {
    render(
      <MemoryRouter>
        <OnboardingWorkflowPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Onboarding Workflow Governance')).toBeInTheDocument()
      expect(screen.getByText('Alex Rivera')).toBeInTheDocument()
      expect(screen.getByText('50%')).toBeInTheDocument()
    })
  })

  it('renders department multi-role board columns', async () => {
    render(
      <MemoryRouter>
        <OnboardingWorkflowPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      // Exactly the three columns the doc (§5.5) specifies — HR/IT/Facilities.
      expect(screen.getByText('HR & Legal Compliance')).toBeInTheDocument()
      expect(screen.getByText('IT & Access Provisioning')).toBeInTheDocument()
      expect(screen.getByText('Facilities & Workplace')).toBeInTheDocument()
    })
  })

  it('opens Start Onboarding modal when clicking Start Onboarding button', async () => {
    render(
      <MemoryRouter>
        <OnboardingWorkflowPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Start Onboarding')).toBeInTheDocument()
    })

    const startButtons = screen.getAllByText('Start Onboarding')
    fireEvent.click(startButtons[0])

    await waitFor(() => {
      expect(screen.getByText('Start New Employee Onboarding')).toBeInTheDocument()
    })
  })

  it('opens Audit Detail slide-over drawer when clicking Audit Detail button', async () => {
    render(
      <MemoryRouter>
        <OnboardingWorkflowPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Audit Detail')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Audit Detail'))

    await waitFor(() => {
      expect(screen.getByText('Checklist Audit Timeline (2/4 Complete)')).toBeInTheDocument()
    })
  })
})
