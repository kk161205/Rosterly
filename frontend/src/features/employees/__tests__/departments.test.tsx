import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DepartmentsPage } from '@/features/employees/pages/DepartmentsPage'
import { employeeService } from '@/features/employees/services/employeeService'
import { mockUser, renderPage } from '@/test/render'

vi.mock('@/features/auth/services/authService', () => ({ authService: { getCurrentUser: vi.fn() } }))
vi.mock('@/features/employees/services/employeeService', () => ({
  employeeService: {
    getDepartments: vi.fn(),
    getEmployees: vi.fn(),
    createDepartment: vi.fn(),
    updateDepartment: vi.fn(),
    deleteDepartment: vi.fn(),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockUser('hr_admin', ['department:create', 'department:update', 'department:delete'])
  vi.mocked(employeeService.getDepartments).mockResolvedValue([
    { id: 'd1', name: 'Engineering', code: 'E', head_count: 4, manager_id: 'u1', manager_name: 'Asha Rao' },
    { id: 'd2', name: 'Legal', code: 'L', head_count: 0, manager_id: null, manager_name: null },
  ])
  vi.mocked(employeeService.getEmployees).mockResolvedValue({
    items: [{ id: 'u1', full_name: 'Asha Rao' }],
    total: 1,
    page: 1,
    page_size: 100,
  } as never)
})

describe('Departments', () => {
  it('lists departments with their head and headcount', async () => {
    renderPage(<DepartmentsPage />)
    const table = await screen.findByRole('table', { name: 'Departments' })
    expect(within(table).getByText('Asha Rao')).toBeInTheDocument()
    expect(within(table).getByText('No head set')).toBeInTheDocument()
  })

  it('adds a department', async () => {
    vi.mocked(employeeService.createDepartment).mockResolvedValue({ id: 'd3', name: 'Finance', code: 'F', head_count: 0 })
    renderPage(<DepartmentsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add department' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add department' })
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Finance' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add department' }))
    await waitFor(() => expect(employeeService.createDepartment).toHaveBeenCalledWith({ name: 'Finance', manager_id: null }))
  })

  it('only lets an empty department be deleted', async () => {
    renderPage(<DepartmentsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Engineering' }))
    const busy = await screen.findByRole('dialog', { name: 'Engineering' })
    expect(within(busy).getByRole('button', { name: 'Delete' })).toBeDisabled()
  })
})
