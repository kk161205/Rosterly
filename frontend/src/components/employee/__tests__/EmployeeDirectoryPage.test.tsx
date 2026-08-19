import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { EmployeeDirectoryPage } from '@/pages/EmployeeDirectoryPage'
import { employeeService } from '@/services/employeeService'
import { authService } from '@/services/authService'
import { EmployeePaginatedResponse, Department } from '@/types/employee'

vi.mock('@/services/authService', () => ({
  authService: {
    getCurrentUser: vi.fn(),
  },
}))

vi.mock('@/services/employeeService', () => ({
  employeeService: {
    getEmployees: vi.fn(),
    getDepartments: vi.fn(),
    getFilterOptions: vi.fn(),
    getEmployeeById: vi.fn(),
    buildOrgTree: vi.fn(),
  },
}))

describe('EmployeeDirectoryPage Component', () => {
  const mockDepartments: Department[] = [
    { id: 'dept-1', name: 'Engineering', code: 'ENG', head_count: 15 },
    { id: 'dept-2', name: 'Product', code: 'PROD', head_count: 8 },
  ]

  const mockFilterMeta = {
    departments: [
      { value: 'dept-1', label: 'Engineering', count: 15 },
      { value: 'dept-2', label: 'Product', count: 8 },
    ],
    statuses: [
      { value: 'active', label: 'Active', count: 1 },
      { value: 'onboarding', label: 'Onboarding', count: 1 },
    ],
    roles: [
      { value: 'manager', label: 'Manager', count: 1 },
      { value: 'employee', label: 'Employee', count: 1 },
    ],
  }

  const mockEmployeeData: EmployeePaginatedResponse = {
    items: [
      {
        id: 'emp-101',
        full_name: 'Sarah Connor',
        email: 'sarah.connor@rosterly.io',
        designation: 'Senior Staff Engineer',
        department_id: 'dept-1',
        department_name: 'Engineering',
        manager_id: null,
        manager_name: null,
        status: 'active',
        role: 'manager',
        phone: '+1 555-0100',
        joining_date: '2023-01-15',
        location: 'San Francisco, CA',
      },
      {
        id: 'emp-102',
        full_name: 'John Reese',
        email: 'john.reese@rosterly.io',
        designation: 'Frontend Engineer',
        department_id: 'dept-1',
        department_name: 'Engineering',
        manager_id: 'emp-101',
        manager_name: 'Sarah Connor',
        status: 'onboarding',
        role: 'employee',
        phone: '+1 555-0101',
        joining_date: '2024-02-01',
        location: 'New York, NY',
      },
    ],
    total: 2,
    page: 1,
    page_size: 10,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authService.getCurrentUser).mockResolvedValue({
      id: 'user-001',
      email: 'alex.chen@rosterly.example',
      full_name: 'Alex Chen',
      role: 'employee',
    })
    vi.mocked(employeeService.getDepartments).mockResolvedValue(mockDepartments)
    vi.mocked(employeeService.getFilterOptions).mockResolvedValue(mockFilterMeta)
    vi.mocked(employeeService.getEmployees).mockResolvedValue(mockEmployeeData)
    vi.mocked(employeeService.buildOrgTree).mockReturnValue([
      {
        id: 'emp-101',
        full_name: 'Sarah Connor',
        designation: 'Senior Staff Engineer',
        department_name: 'Engineering',
        status: 'active',
        direct_reports: [
          {
            id: 'emp-102',
            full_name: 'John Reese',
            designation: 'Frontend Engineer',
            department_name: 'Engineering',
            status: 'onboarding',
            manager_id: 'emp-101',
          },
        ],
      },
    ])
  })

  it('renders employee directory list view table with search and filter controls', async () => {
    render(
      <MemoryRouter>
        <EmployeeDirectoryPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Employee Directory')).toBeInTheDocument()
      expect(screen.getAllByText('Sarah Connor')[0]).toBeInTheDocument()
      expect(screen.getByText('John Reese')).toBeInTheDocument()
      expect(screen.getByText('Senior Staff Engineer')).toBeInTheDocument()
    })
  })

  it('switches view mode from List View to Org Chart View', async () => {
    render(
      <MemoryRouter>
        <EmployeeDirectoryPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getAllByText('Sarah Connor')[0]).toBeInTheDocument()
    })

    const orgChartBtn = screen.getByRole('button', { name: /Org Chart View/i })
    fireEvent.click(orgChartBtn)

    await waitFor(() => {
      expect(screen.getByText('Organizational Hierarchy Tree')).toBeInTheDocument()
    })
  })

  it('opens employee profile slide-over drawer when a row is clicked', async () => {
    render(
      <MemoryRouter>
        <EmployeeDirectoryPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getAllByText('Sarah Connor')[0]).toBeInTheDocument()
    })

    const rowName = screen.getAllByText('Sarah Connor')[0]
    fireEvent.click(rowName)

    await waitFor(() => {
      expect(screen.getByText('Employee Profile Drawer')).toBeInTheDocument()
      expect(screen.getAllByText('sarah.connor@rosterly.io').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('displays error banner and retry button on API failure', async () => {
    vi.mocked(employeeService.getEmployees)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(mockEmployeeData)

    render(
      <MemoryRouter>
        <EmployeeDirectoryPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(
        screen.getByText(/Unable to load employee directory records from server/i)
      ).toBeInTheDocument()
    })

    const retryBtn = screen.getByRole('button', { name: /Retry Load/i })
    fireEvent.click(retryBtn)

    await waitFor(() => {
      expect(screen.getAllByText('Sarah Connor')[0]).toBeInTheDocument()
    })
  })

  it('shows confirmation popup when Super Admin clicks delete in employee drawer', async () => {
    vi.mocked(authService.getCurrentUser).mockResolvedValue({
      id: 'usr-1',
      email: 'admin@rosterly.io',
      full_name: 'Admin User',
      role: 'super_admin',
    })

    render(
      <MemoryRouter>
        <EmployeeDirectoryPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getAllByText('Sarah Connor')[0]).toBeInTheDocument()
    })

    // Open drawer
    fireEvent.click(screen.getAllByText('Sarah Connor')[0])

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Delete Record/i })).toBeInTheDocument()
    })

    // Click delete action
    fireEvent.click(screen.getByRole('button', { name: /Delete Record/i }))

    // Verify confirmation modal popup appears
    await waitFor(() => {
      expect(screen.getByText('Delete Employee Record')).toBeInTheDocument()
      expect(screen.getByText(/This will delete the user account and clear direct report hierarchy links/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Yes, Delete Employee/i })).toBeInTheDocument()
    })

    // Click cancel
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }))

    // Modal closes
    await waitFor(() => {
      expect(screen.queryByText('Delete Employee Record')).not.toBeInTheDocument()
    })
  })
})

