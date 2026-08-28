import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { EmployeeProfilePage } from '@/pages/EmployeeProfilePage'
import { profileService } from '@/services/profileService'
import { authStorage } from '@/utils/authStorage'
import { EmployeeProfile, DocumentItem, AssignedAssetsResponse, LifecycleChecklist } from '@/types/profile'

vi.mock('@/services/profileService', () => ({
  profileService: {
    getEmployeeProfile: vi.fn(),
    getEmployeeDocuments: vi.fn(),
    getEmployeeAssets: vi.fn(),
    getEmployeeLifecycle: vi.fn(),
    updateEmployeeProfile: vi.fn(),
    uploadEmployeeDocument: vi.fn(),
    deleteEmployeeDocument: vi.fn(),
    validateDocumentFile: vi.fn().mockReturnValue({ valid: true }),
  },
}))

vi.mock('@/utils/authStorage', () => ({
  authStorage: {
    getUserRole: vi.fn().mockReturnValue('employee'),
    getUser: vi.fn().mockReturnValue({
      id: 'emp-101',
      email: 'alex.vance@rosterly.io',
      full_name: 'Alex Vance',
      role: 'employee',
    }),
    getAccessToken: vi.fn().mockReturnValue('mock-token'),
    getRefreshToken: vi.fn().mockReturnValue('mock-refresh-token'),
  },
}))

vi.mock('@/services/employeeService', () => ({
  employeeService: {
    offboardEmployee: vi.fn().mockResolvedValue({}),
  },
}))

describe('EmployeeProfilePage Component', () => {
  const mockProfile: EmployeeProfile = {
    id: 'emp-101',
    full_name: 'Alex Vance',
    email: 'alex.vance@rosterly.io',
    phone: '+1 (555) 234-5678',
    designation: 'Senior Frontend Engineer',
    department: 'Engineering',
    location: 'San Francisco, CA (HQ)',
    role: 'employee',
    status: 'active',
    joining_date: '2024-03-15',
    employee_code: 'EMP-0101',
    manager: {
      id: 'emp-002',
      full_name: 'Marcus Brody',
      designation: 'VP of Engineering',
      role: 'manager',
    },
    emergency_contact: {
      name: 'Elena Vance',
      relationship: 'Spouse',
      phone: '+1 (555) 987-6543',
    },
  }

  const mockDocuments: DocumentItem[] = [
    {
      id: 'doc-1',
      file_name: 'Employment_Contract.pdf',
      doc_name: 'Employment_Contract.pdf',
      doc_type: 'contract',
      is_confidential: true,
      uploaded_at: '2024-03-15T09:30:00Z',
      uploaded_by_name: 'HR',
      size_bytes: 2000000,
      file_url: '#',
    },
  ]

  const mockAssets: AssignedAssetsResponse = {
    current: [
      {
        id: 'ast-1',
        asset_name: 'MacBook Pro 16" M3 Max',
        asset_tag: 'AST-LAP-042',
        serial_number: 'C02G809DQ05D',
        category: 'laptop',
        assigned_at: '2024-03-15T10:00:00Z',
        warranty_expires_at: '2027-03-15T00:00:00Z',
        warranty_status: 'active',
        status: 'active',
      },
    ],
    history: [],
  }

  const mockLifecycle: LifecycleChecklist = {
    id: 'chk-1',
    type: 'onboarding',
    status: 'active',
    progress_percentage: 80,
    total_items: 5,
    completed_items: 4,
    items: [
      {
        id: 'i-1',
        title: 'Identity Setup',
        category: 'hr',
        owner_role: 'hr_admin',
        status: 'completed',
      },
    ],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(profileService.getEmployeeProfile).mockResolvedValue(mockProfile)
    vi.mocked(profileService.getEmployeeDocuments).mockResolvedValue(mockDocuments)
    vi.mocked(profileService.getEmployeeAssets).mockResolvedValue(mockAssets)
    vi.mocked(profileService.getEmployeeLifecycle).mockResolvedValue(mockLifecycle)
  })

  const renderComponent = () => {
    return render(
      <MemoryRouter initialEntries={['/employees/emp-101']}>
        <Routes>
          <Route path="/employees/:id" element={<EmployeeProfilePage />} />
        </Routes>
      </MemoryRouter>
    )
  }

  it('renders summary header card with employee name and code', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getAllByText('Alex Vance')[0]).toBeInTheDocument()
      expect(screen.getAllByText('EMP-0101')[0]).toBeInTheDocument()
      expect(screen.getByText('Senior Frontend Engineer')).toBeInTheDocument()
    })
  })

  it('allows switching between tabs', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Personal & Contact Details')).toBeInTheDocument()
    })

    // Click Document Vault tab
    const docTab = screen.getByText('Document Vault')
    fireEvent.click(docTab)

    await waitFor(() => {
      expect(screen.getByText('Vault Documents (1)')).toBeInTheDocument()
      expect(screen.getByText('Employment_Contract.pdf')).toBeInTheDocument()
    })

    // Click Hardware tab
    const assetTab = screen.getByText('Assigned Hardware & Licenses')
    fireEvent.click(assetTab)

    await waitFor(() => {
      expect(screen.getByText('MacBook Pro 16" M3 Max')).toBeInTheDocument()
    })
  })

  it('shows action buttons based on user permissions', async () => {
    vi.mocked(authStorage.getUserRole).mockReturnValue('hr_admin')
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Edit Profile')).toBeInTheDocument()
      expect(screen.getByText('Start Offboarding')).toBeInTheDocument()
    })
  })
})
