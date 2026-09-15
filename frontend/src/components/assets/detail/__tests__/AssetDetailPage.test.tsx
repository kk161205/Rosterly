import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AssetDetailPage } from '@/pages/AssetDetailPage'
import { assetService } from '@/services/assetService'
import { authService } from '@/services/authService'
import { employeeService } from '@/services/employeeService'
import { AssetDetailResponse, AssetAssignment, MaintenanceTicket } from '@/types/assets'

vi.mock('@/services/authService', () => ({
  authService: {
    getCurrentUser: vi.fn(),
  },
}))

vi.mock('@/services/assetService', () => ({
  assetService: {
    getAssetDetail: vi.fn(),
    getAssetAssignments: vi.fn(),
    getAssetMaintenance: vi.fn(),
    assignAsset: vi.fn(),
    returnAsset: vi.fn(),
    updateAsset: vi.fn(),
    createMaintenanceTicket: vi.fn(),
  },
}))

vi.mock('@/services/employeeService', () => ({
  employeeService: {
    getEmployees: vi.fn(),
  },
}))

describe('AssetDetailPage Component', () => {
  const mockAssetDetail: AssetDetailResponse = {
    asset: {
      id: 'asset-001',
      asset_tag: 'AST-2026-00042',
      name: 'MacBook Pro 16 M3 Max',
      category: 'laptop',
      serial_number: 'C02G1234MD6R',
      vendor: 'Apple Inc.',
      purchase_date: '2025-01-15',
      purchase_cost: 3499.0,
      current_value: 2800.0,
      depreciation_method: 'straight_line',
      useful_life_months: 36,
      warranty_expiry: '2027-01-15',
      amc_expiry: '2026-09-20',
      status: 'assigned',
      current_holder_id: 'emp-101',
      current_holder: {
        id: 'emp-101',
        full_name: 'Sarah Connor',
        email: 'sarah.connor@rosterly.io',
        department_name: 'Engineering',
      },
      is_expiring_soon: false,
      created_at: '2025-01-15T10:00:00Z',
      updated_at: '2025-01-15T10:00:00Z',
    },
    current_assignment: {
      id: 'assign-001',
      asset_id: 'asset-001',
      employee_id: 'emp-101',
      employee_name: 'Sarah Connor',
      assigned_by: 'admin-001',
      assigned_by_name: 'IT Admin',
      assigned_at: '2025-01-16T10:00:00Z',
      returned_at: null,
      condition_at_assignment: 'Brand New In Box',
      condition_at_return: null,
      notes: 'Issued with 140W USB-C power adapter',
    },
  }

  const mockAssignments: AssetAssignment[] = [
    {
      id: 'assign-001',
      asset_id: 'asset-001',
      employee_id: 'emp-101',
      employee_name: 'Sarah Connor',
      assigned_by: 'admin-001',
      assigned_by_name: 'IT Admin',
      assigned_at: '2025-01-16T10:00:00Z',
      returned_at: null,
      condition_at_assignment: 'Brand New In Box',
      condition_at_return: null,
      notes: 'Issued with 140W USB-C power adapter',
    },
  ]

  const mockTickets: MaintenanceTicket[] = [
    {
      id: 'ticket-001',
      asset_id: 'asset-001',
      reported_by: 'emp-101',
      reporter_name: 'Sarah Connor',
      assigned_to: 'admin-001',
      assignee_name: 'IT Admin',
      issue_description: 'Trackpad haptic feedback glitch after OS update',
      priority: 'medium',
      status: 'resolved',
      resolved_at: '2025-02-10T14:00:00Z',
      created_at: '2025-02-08T09:00:00Z',
      updated_at: '2025-02-10T14:00:00Z',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authService.getCurrentUser).mockResolvedValue({
      id: 'admin-001',
      email: 'admin@rosterly.example',
      full_name: 'IT Admin User',
      role: 'it_admin',
      permissions: [],
    })
    vi.mocked(assetService.getAssetDetail).mockResolvedValue(mockAssetDetail)
    vi.mocked(assetService.getAssetAssignments).mockResolvedValue(mockAssignments)
    vi.mocked(assetService.getAssetMaintenance).mockResolvedValue(mockTickets)
    vi.mocked(assetService.createMaintenanceTicket).mockResolvedValue(mockTickets[0])
    vi.mocked(employeeService.getEmployees).mockResolvedValue({
      items: [
        {
          id: 'emp-102',
          full_name: 'John Reese',
          email: 'john.reese@rosterly.io',
          designation: 'Staff Engineer',
          department_id: 'dept-1',
          department_name: 'Engineering',
          manager_id: null,
          manager_name: null,
          status: 'active',
          role: 'employee',
        },
      ],
      total: 1,
      page: 1,
      page_size: 100,
    })
  })

  const renderComponent = (assetId = 'asset-001') => {
    return render(
      <MemoryRouter initialEntries={[`/assets/${assetId}`]}>
        <Routes>
          <Route path="/assets/:id" element={<AssetDetailPage />} />
        </Routes>
      </MemoryRouter>
    )
  }

  it('renders Hero Banner, Live Depreciation Card, and Specifications tab', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'MacBook Pro 16 M3 Max' })).toBeInTheDocument()
      expect(screen.getAllByText('AST-2026-00042').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Apple Inc.').length).toBeGreaterThan(0)
      expect(screen.getByText('Depreciation & Book Value Analysis')).toBeInTheDocument()
      expect(screen.getByText('Hardware & Procurement Specs')).toBeInTheDocument()
    })
  })

  it('switches tabs to Assignment History and displays custody logs', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Assignment History')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Assignment History'))

    await waitFor(() => {
      expect(screen.getByText(/Historical Custody & Assignment Log/i)).toBeInTheDocument()
    })

    const historyTable = screen.getByRole('table')
    expect(within(historyTable).getByText('Sarah Connor')).toBeInTheDocument()
    expect(within(historyTable).getByText('Brand New In Box')).toBeInTheDocument()
    expect(within(historyTable).getByText('Currently Active')).toBeInTheDocument()
  })

  it('switches tabs to Maintenance History and displays service tickets', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Maintenance History')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Maintenance History'))

    await waitFor(() => {
      expect(screen.getByText(/Maintenance & Service Tickets/i)).toBeInTheDocument()
      expect(screen.getByText(/Trackpad haptic feedback glitch/i)).toBeInTheDocument()
    })
  })

  it('opens Return to Stock modal and submits return payload', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Return to Stock/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Return to Stock/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Return Asset to Stock/i })).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/normal wear and tear/i)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Confirm Return/i }))

    await waitFor(() => {
      expect(assetService.returnAsset).toHaveBeenCalledWith(
        'asset-001',
        expect.objectContaining({
          condition_notes: 'Returned in Good Working Condition',
        })
      )
    })
  })

  it('opens Raise Ticket modal from Maintenance History and submits a real ticket', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Maintenance History')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Maintenance History'))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Raise Ticket/i })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /Raise Ticket/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Raise Maintenance Ticket/i })).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText(/Describe the hardware defect/i), {
      target: { value: 'Keyboard backlight not working' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Submit Ticket/i }))

    await waitFor(() => {
      expect(assetService.createMaintenanceTicket).toHaveBeenCalledWith({
        asset_id: 'asset-001',
        issue_description: 'Keyboard backlight not working',
        priority: 'medium',
      })
    })
  })

  it('displays 404 Not Found state when asset ID does not exist', async () => {
    vi.mocked(assetService.getAssetDetail).mockRejectedValue({
      response: { status: 404 },
    })

    renderComponent('unknown-id')

    await waitFor(() => {
      expect(screen.getByText(/Asset Record Not Found/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Back to Asset Inventory/i })).toBeInTheDocument()
    })
  })
})
