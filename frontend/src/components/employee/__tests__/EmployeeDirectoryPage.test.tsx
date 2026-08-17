import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { EmployeeDirectoryPage } from '@/pages/EmployeeDirectoryPage'
import { employeeService } from '@/services/employeeService'
import { EmployeePaginatedResponse, Department } from '@/types/employee'

vi.mock('@/services/employeeService', () => ({
  employeeService: {
    getEmployees: vi.fn(),
    getDepartments: vi.fn(),
    getEmployeeById: vi.fn(),
    buildOrgTree: vi.fn(),
  },
}))

describe('EmployeeDirectoryPage Component', () => {
  const mockDepartments: Department[] = [
    { id: 'dept-1', name: 'Engineering', code: 'ENG', head_count: 15 },
    { id: 'dept-2', name: 'Product', code: 'PROD', head_count: 8 },
  ]

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
    vi.mocked(employeeService.getDepartments).mockResolvedValue(mockDepartments)
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
      expect(screen.getByText('Sarah Connor')).toBeInTheDocument()
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
      expect(screen.getByText('Sarah Connor')).toBeInTheDocument()
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
      expect(screen.getByText('Sarah Connor')).toBeInTheDocument()
    })

    const rowName = screen.getByText('Sarah Connor')
    fireEvent.click(rowName)

    await waitFor(() => {
      expect(screen.getByText('Employee Profile Drawer')).toBeInTheDocument()
      expect(screen.getByText('sarah.connor@rosterly.io')).toBeInTheDocument()
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
      expect(screen.getByText('Sarah Connor')).toBeInTheDocument()
    })
  })
})
