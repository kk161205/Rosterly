import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EmployeeDirectoryPage } from '@/features/employees/pages/EmployeeDirectoryPage'
import { EmployeeProfilePage } from '@/features/employees/pages/EmployeeProfilePage'
import { employeeService } from '@/features/employees/services/employeeService'
import { profileService } from '@/features/employees/services/profileService'
import type { Employee } from '@/features/employees/types/employee'
import type { EmployeeProfile } from '@/features/employees/types/profile'
import { lifecycleService } from '@/features/lifecycle/services/lifecycleService'
import { mockUser, renderPage } from '@/test/render'

vi.mock('@/features/auth/services/authService', () => ({ authService: { getCurrentUser: vi.fn() } }))
vi.mock('@/features/employees/services/employeeService', () => ({
  employeeService: {
    getEmployees: vi.fn(),
    getFilterOptions: vi.fn(),
    getDepartments: vi.fn(),
    getRoles: vi.fn(),
    getEmployeeById: vi.fn(),
    deleteEmployee: vi.fn(),
  },
}))
vi.mock('@/features/lifecycle/services/lifecycleService', () => ({
  lifecycleService: { startOffboarding: vi.fn() },
}))
vi.mock('@/features/employees/services/profileService', () => ({
  profileService: {
    getEmployeeProfile: vi.fn(),
    updateEmployeeProfile: vi.fn(),
    getEmployeeDocuments: vi.fn(),
    getEmployeeAssets: vi.fn(),
    getEmployeeLifecycle: vi.fn(),
    uploadEmployeeDocument: vi.fn(),
    deleteEmployeeDocument: vi.fn(),
  },
}))

const person = (over: Partial<Employee>): Employee => ({
  id: 'p1',
  employee_code: 'RST-0001',
  full_name: 'Priya Nair',
  email: 'priya@example.com',
  designation: 'Head of IT',
  department_name: 'IT Operations',
  manager_id: null,
  manager_name: null,
  status: 'active',
  ...over,
})

const profile: EmployeeProfile = {
  id: 'p2',
  employee_code: 'RST-0002',
  full_name: 'Aman Gupta',
  email: 'aman@example.com',
  role_id: 'r-emp',
  role_name: 'employee',
  department_id: 'd1',
  department_name: 'Design',
  manager_id: 'p1',
  manager_name: 'Priya Nair',
  manager: { id: 'p1', full_name: 'Priya Nair', designation: 'Head of IT' },
  direct_reports: [],
  designation: 'Product Designer',
  phone: '+91 98765 43210',
  emergency_contact_name: null,
  emergency_contact_phone: null,
  status: 'active',
  date_of_joining: '2025-06-01',
  date_of_exit: null,
  created_at: '2025-06-01T00:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(employeeService.getFilterOptions).mockResolvedValue({ departments: [], statuses: [], roles: [] })
  vi.mocked(employeeService.getEmployees).mockResolvedValue({
    items: [person({}), person({ id: 'p2', full_name: 'Aman Gupta', email: 'aman@example.com', designation: 'Product Designer', department_name: 'Design', manager_id: 'p1', manager_name: 'Priya Nair' })],
    total: 2,
    page: 1,
    page_size: 25,
  })
  vi.mocked(profileService.getEmployeeProfile).mockResolvedValue(profile)
  vi.mocked(profileService.getEmployeeDocuments).mockResolvedValue([])
  vi.mocked(profileService.getEmployeeAssets).mockResolvedValue({ current: [], history: [] })
  vi.mocked(profileService.getEmployeeLifecycle).mockResolvedValue(null)
})

describe('Directory (§5.3)', () => {
  it('lists people with title, department and status', async () => {
    mockUser('employee', ['request:create'])
    renderPage(<EmployeeDirectoryPage />)
    const table = await screen.findByRole('table', { name: 'People' })
    expect(within(table).getByText('Priya Nair')).toBeInTheDocument()
    expect(within(table).getByText('Product Designer')).toBeInTheDocument()
  })

  it('opens a person panel; the profile link needs employee:read', async () => {
    mockUser('employee', [])
    renderPage(<EmployeeDirectoryPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open Aman Gupta' }))
    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByText('Priya Nair')).toBeInTheDocument()
    expect(within(panel).queryByRole('link', { name: 'Open profile' })).not.toBeInTheDocument()
  })

  it('shows what the person holds, or that nothing is assigned', async () => {
    mockUser('hr_admin', ['employee:read', 'employee:update'])
    vi.mocked(profileService.getEmployeeAssets).mockResolvedValue({
      current: [{ id: 's1', asset_id: 'a1', asset_name: 'ThinkPad X1', asset_tag: 'AST-0005', category: 'laptop', assigned_at: '2026-01-10T00:00:00Z' }],
      history: [],
    })
    renderPage(<EmployeeDirectoryPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open Aman Gupta' }))
    const panel = await screen.findByRole('dialog')
    expect(await within(panel).findByText('ThinkPad X1')).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Start offboarding' })).toBeInTheDocument()
  })

  it('asks before offboarding and stays locked while it runs', async () => {
    mockUser('hr_admin', ['employee:read', 'employee:update'])
    let finish: () => void = () => {}
    vi.mocked(lifecycleService.startOffboarding).mockReturnValue(
      new Promise((resolve) => {
        finish = () => resolve({ id: 'c9' } as never)
      }),
    )
    renderPage(<EmployeeDirectoryPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open Aman Gupta' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Start offboarding' }))
    const confirm = await screen.findByRole('dialog', { name: 'Offboard Aman Gupta?' })
    expect(within(confirm).getByRole('button', { name: 'No, keep Aman' })).toBeInTheDocument()
    fireEvent.click(within(confirm).getByRole('button', { name: 'Yes, start offboarding' }))
    // While the request runs: buttons locked, Esc ignored
    expect(await within(confirm).findByRole('button', { name: /Starting offboarding/ })).toBeDisabled()
    expect(within(confirm).getByRole('button', { name: 'No, keep Aman' })).toBeDisabled()
    fireEvent.keyDown(confirm, { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: 'Offboard Aman Gupta?' })).toBeInTheDocument()
    finish()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Offboard Aman Gupta?' })).not.toBeInTheDocument())
    expect(lifecycleService.startOffboarding).toHaveBeenCalledWith({ employee_id: 'p2', exit_date: undefined, reason: undefined })
    expect(await screen.findByText(/Offboarding started/)).toBeInTheDocument()
  })

  it('hides edit and offboarding from people who can’t do them', async () => {
    mockUser('employee', [])
    vi.mocked(profileService.getEmployeeAssets).mockRejectedValue({ response: { status: 403 } })
    renderPage(<EmployeeDirectoryPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open Aman Gupta' }))
    const panel = await screen.findByRole('dialog')
    expect(within(panel).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: 'Start offboarding' })).not.toBeInTheDocument()
    await waitFor(() => expect(within(panel).queryByText('Assets')).not.toBeInTheDocument())
  })

  it('builds the org chart from manager links', async () => {
    mockUser('hr_admin', ['employee:read'])
    renderPage(<EmployeeDirectoryPage />, { route: '/employees?view=chart' })
    const tree = await screen.findByRole('tree', { name: 'Org chart' })
    expect(within(tree).getByText(/1 report/)).toBeInTheDocument()
    fireEvent.click(within(tree).getByRole('button', { name: "Collapse Priya Nair's team" }))
    expect(within(tree).queryByText('Aman Gupta')).not.toBeInTheDocument()
  })

  it('searches through the API', async () => {
    mockUser('employee', [])
    renderPage(<EmployeeDirectoryPage />)
    fireEvent.change(await screen.findByLabelText('Search people'), { target: { value: 'aman' } })
    await waitFor(() => expect(employeeService.getEmployees).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'aman' })), {
      timeout: 2000,
    })
  })
})

describe('Profile (§5.4)', () => {
  it('shows details and the manager link', async () => {
    mockUser('hr_admin', ['employee:read', 'employee:update'])
    renderPage(<EmployeeProfilePage />, { route: '/employees/p2', path: '/employees/:id' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Aman Gupta' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Priya Nair' })).toHaveAttribute('href', '/employees/p1')
    expect(screen.getByRole('button', { name: 'Edit profile' })).toBeInTheDocument()
  })

  it('lets people edit only their own contact details', async () => {
    mockUser('employee', [], { id: 'p2' })
    renderPage(<EmployeeProfilePage />, { route: '/profile', path: '/profile' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Your profile' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit contact details' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByLabelText('Job title')).not.toBeInTheDocument()
    fireEvent.change(within(dialog).getByLabelText('Phone'), { target: { value: '+91 90000 00000' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(profileService.updateEmployeeProfile).toHaveBeenCalledWith('p2', { phone: '+91 90000 00000' }))
  })

  it('offers only active or inactive as a status when HR edits a profile', async () => {
    mockUser('hr_admin', ['employee:read', 'employee:update'])
    vi.mocked(employeeService.getDepartments).mockResolvedValue([])
    vi.mocked(employeeService.getRoles).mockResolvedValue([])
    renderPage(<EmployeeProfilePage />, { route: '/employees/p2', path: '/employees/:id' })
    fireEvent.click(await screen.findByRole('button', { name: 'Edit profile' }))
    const status = within(await screen.findByRole('dialog')).getByLabelText('Status') as HTMLSelectElement
    expect(Array.from(status.options).map((o) => o.value)).toEqual(['active', 'inactive'])
    expect(status).not.toBeDisabled()
  })

  it('locks the status of someone who is being offboarded', async () => {
    mockUser('hr_admin', ['employee:read', 'employee:update'])
    vi.mocked(employeeService.getDepartments).mockResolvedValue([])
    vi.mocked(employeeService.getRoles).mockResolvedValue([])
    vi.mocked(profileService.getEmployeeProfile).mockResolvedValue({ ...profile, status: 'offboarding' })
    renderPage(<EmployeeProfilePage />, { route: '/employees/p2', path: '/employees/:id' })
    fireEvent.click(await screen.findByRole('button', { name: 'Edit profile' }))
    const dialog = await screen.findByRole('dialog')
    const status = within(dialog).getByLabelText('Status') as HTMLSelectElement
    expect(status).toBeDisabled()
    expect(status.value).toBe('offboarding')
    expect(within(dialog).getByText('Set by offboarding; it can’t be changed here.')).toBeInTheDocument()
  })

  it('switches to the equipment tab', async () => {
    mockUser('hr_admin', ['employee:read'])
    vi.mocked(profileService.getEmployeeAssets).mockResolvedValue({
      current: [{ id: 's1', asset_id: 'a1', asset_name: 'MacBook Air M2', asset_tag: 'AST-0001', category: 'laptop', assigned_at: '2025-06-14T00:00:00Z' }],
      history: [],
    })
    renderPage(<EmployeeProfilePage />, { route: '/employees/p2', path: '/employees/:id' })
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Equipment' }))
    expect(await screen.findByText('MacBook Air M2')).toBeInTheDocument()
  })
})
