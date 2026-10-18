import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OnboardingWorkflowPage } from '@/features/lifecycle/pages/OnboardingWorkflowPage'
import { OffboardingWorkflowPage } from '@/features/lifecycle/pages/OffboardingWorkflowPage'
import { lifecycleService } from '@/features/lifecycle/services/lifecycleService'
import type { Checklist } from '@/features/lifecycle/types/checklist'
import { mockUser, renderPage } from '@/test/render'

vi.mock('@/features/auth/services/authService', () => ({ authService: { getCurrentUser: vi.fn() } }))
vi.mock('@/features/lifecycle/services/lifecycleService', () => ({
  lifecycleService: {
    list: vi.fn(),
    get: vi.fn(),
    setItemStatus: vi.fn(),
    startOnboarding: vi.fn(),
    startOffboarding: vi.fn(),
    completeOffboarding: vi.fn(),
  },
}))
vi.mock('@/features/employees/services/employeeService', () => ({
  employeeService: { getEmployees: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 8 }), getEmployeeById: vi.fn() },
}))

const checklist = (over: Partial<Checklist> = {}): Checklist => ({
  id: 'c1',
  employee_id: 'u1',
  employee_name: 'Kavya Rao',
  employee_designation: 'Designer',
  employee_department: 'Design',
  date_of_joining: '2099-01-20',
  date_of_exit: null,
  type: 'onboarding',
  status: 'in_progress',
  completed_at: null,
  created_at: '2026-10-01T00:00:00Z',
  progress_percentage: 33,
  total_items: 3,
  completed_items: 1,
  items: [
    { id: 'i1', checklist_id: 'c1', task_name: 'Create email account', owner_role_id: 'r-it', owner_role_name: 'it_admin', status: 'done', completed_by: 'x', completed_by_name: 'Miles Dyson', asset_assignment_id: null, completed_at: '2026-10-02T00:00:00Z', sort_order: 1 },
    { id: 'i2', checklist_id: 'c1', task_name: 'Provision laptop', owner_role_id: 'r-it', owner_role_name: 'it_admin', status: 'pending', completed_by: null, completed_by_name: null, asset_assignment_id: null, completed_at: null, sort_order: 2 },
    { id: 'i3', checklist_id: 'c1', task_name: 'Sign contract', owner_role_id: 'r-hr', owner_role_name: 'hr_admin', status: 'pending', completed_by: null, completed_by_name: null, asset_assignment_id: null, completed_at: null, sort_order: 3 },
  ],
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(lifecycleService.list).mockResolvedValue({ checklists: [checklist()], total: 1, page: 1, page_size: 25, total_pages: 1 })
  vi.mocked(lifecycleService.get).mockResolvedValue(checklist())
})

describe('Onboarding (§5.5)', () => {
  it('lists joiners with their first day and progress', async () => {
    mockUser('hr_admin', [])
    renderPage(<OnboardingWorkflowPage />)
    const table = await screen.findByRole('table', { name: 'Onboarding' })
    expect(within(table).getByText('Kavya Rao')).toBeInTheDocument()
    expect(within(table).getByText('20 Jan 2099')).toBeInTheDocument()
    expect(within(table).getByText('1 of 3 done')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Start onboarding/ })).toBeInTheDocument()
  })

  it('opens the checklist with the viewer’s own tasks first and open', async () => {
    mockUser('it_admin', [])
    renderPage(<OnboardingWorkflowPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open Kavya Rao' }))
    const panel = await screen.findByRole('dialog')
    const mine = await within(panel).findByRole('button', { name: /Your tasks/ })
    expect(mine).toHaveAttribute('aria-expanded', 'true')
    expect(within(panel).getByRole('button', { name: /HR admin/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: /Start onboarding/ })).not.toBeInTheDocument()
    fireEvent.click(within(panel).getByRole('button', { name: 'Mark done' }))
    await waitFor(() => expect(lifecycleService.setItemStatus).toHaveBeenCalledWith('onboarding', 'c1', 'i2', 'done'))
  })
})

describe('Offboarding (§5.6)', () => {
  it('only enables completion once every task is done', async () => {
    mockUser('hr_admin', [])
    vi.mocked(lifecycleService.get).mockResolvedValue(checklist({ type: 'offboarding', date_of_exit: '2099-01-31' }))
    renderPage(<OffboardingWorkflowPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open Kavya Rao' }))
    const complete = await screen.findByRole('button', { name: 'Complete offboarding' })
    expect(complete).toBeDisabled()
    expect(screen.getByText('Available once every task is done.')).toBeInTheDocument()
  })

  it('asks for confirmation before closing the account', async () => {
    mockUser('hr_admin', [])
    const done = checklist({ type: 'offboarding' })
    done.items = done.items.map((i) => ({ ...i, status: 'done' }))
    vi.mocked(lifecycleService.get).mockResolvedValue(done)
    vi.mocked(lifecycleService.completeOffboarding).mockResolvedValue(done)
    renderPage(<OffboardingWorkflowPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open Kavya Rao' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Complete offboarding' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Complete and close account' }))
    await waitFor(() => expect(lifecycleService.completeOffboarding).toHaveBeenCalledWith('c1'))
  })
})
