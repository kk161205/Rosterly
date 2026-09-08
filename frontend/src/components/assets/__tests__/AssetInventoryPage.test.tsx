import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AssetInventoryPage } from '@/pages/AssetInventoryPage'
import { assetService } from '@/services/assetService'
import { authService } from '@/services/authService'
import { AssetListResponse } from '@/types/assets'
import { Department } from '@/types/employee'

vi.mock('@/services/authService', () => ({
  authService: {
    getCurrentUser: vi.fn(),
  },
}))

vi.mock('@/services/assetService', () => ({
  assetService: {
    getAssets: vi.fn(),
    getDepartments: vi.fn(),
    createAsset: vi.fn(),
    updateAsset: vi.fn(),
    bulkUpdateAssets: vi.fn(),
    deleteAsset: vi.fn(),
  },
}))

describe('AssetInventoryPage Component', () => {
  const mockDepartments: Department[] = [
    { id: 'dept-1', name: 'Engineering', code: 'ENG' },
    { id: 'dept-2', name: 'Design', code: 'DSGN' },
  ]

  const mockAssetData: AssetListResponse = {
    items: [
      {
        id: 'asset-101',
        asset_tag: 'AST-2026-00001',
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
        amc_expiry: null,
        status: 'assigned',
        current_holder_id: 'user-001',
        current_holder: {
          id: 'user-001',
          full_name: 'Sarah Connor',
          email: 'sarah.connor@rosterly.io',
          department_id: 'dept-1',
          department_name: 'Engineering',
        },
        is_expiring_soon: false,
        created_at: '2025-01-15T10:00:00Z',
        updated_at: '2025-01-15T10:00:00Z',
      },
      {
        id: 'asset-102',
        asset_tag: 'AST-2026-00002',
        name: 'Dell UltraSharp 32 4K Monitor',
        category: 'monitor',
        serial_number: 'DL-8823-99',
        vendor: 'Dell Technologies',
        purchase_date: '2025-03-01',
        purchase_cost: 899.0,
        current_value: 750.0,
        depreciation_method: 'straight_line',
        useful_life_months: 48,
        warranty_expiry: '2026-09-20',
        amc_expiry: null,
        status: 'in_stock',
        current_holder_id: null,
        current_holder: null,
        is_expiring_soon: true,
        created_at: '2025-03-01T10:00:00Z',
        updated_at: '2025-03-01T10:00:00Z',
      },
      {
        id: 'asset-103',
        asset_tag: 'AST-2026-00003',
        name: 'Herman Miller Aeron Chair',
        category: 'furniture',
        serial_number: 'HM-CH-019',
        vendor: 'Herman Miller',
        purchase_date: '2024-06-10',
        purchase_cost: 1200.0,
        current_value: 900.0,
        depreciation_method: 'straight_line',
        useful_life_months: 60,
        warranty_expiry: null,
        amc_expiry: null,
        status: 'under_maintenance',
        current_holder_id: null,
        current_holder: null,
        is_expiring_soon: false,
        created_at: '2024-06-10T10:00:00Z',
        updated_at: '2024-06-10T10:00:00Z',
      },
    ],
    total: 3,
    page: 1,
    page_size: 20,
    total_pages: 1,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authService.getCurrentUser).mockResolvedValue({
      id: 'admin-001',
      email: 'admin@rosterly.example',
      full_name: 'IT Admin User',
      role: 'it_admin',
    })
    vi.mocked(assetService.getDepartments).mockResolvedValue(mockDepartments)
    vi.mocked(assetService.getAssets).mockResolvedValue(mockAssetData)
  })

  it('renders page header, summary ribbon metrics, and asset table data', async () => {
    render(
      <MemoryRouter>
        <AssetInventoryPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Asset Inventory/i })).toBeInTheDocument()
      expect(screen.getByText('MacBook Pro 16 M3 Max')).toBeInTheDocument()
      expect(screen.getByText('AST-2026-00001')).toBeInTheDocument()
      expect(screen.getByText('Dell UltraSharp 32 4K Monitor')).toBeInTheDocument()
      expect(screen.getByText('Herman Miller Aeron Chair')).toBeInTheDocument()
    })

    // Verify summary ribbon renders
    expect(screen.getByText('Total Assets')).toBeInTheDocument()
    expect(screen.getByText('Deployed Assets')).toBeInTheDocument()
    expect(screen.getByText('In-Stock Spares')).toBeInTheDocument()
    expect(screen.getByText('Under Maintenance')).toBeInTheDocument()
  })

  it('opens Asset Detail Drawer when a table row is clicked', async () => {
    render(
      <MemoryRouter>
        <AssetInventoryPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('MacBook Pro 16 M3 Max')).toBeInTheDocument()
    })

    const row = screen.getByText('MacBook Pro 16 M3 Max').closest('tr')
    expect(row).toBeInTheDocument()
    if (row) fireEvent.click(row)

    await waitFor(() => {
      expect(screen.getByText('Asset Details')).toBeInTheDocument()
      expect(screen.getByText('Sarah Connor')).toBeInTheDocument()
      expect(screen.getByText('Financial & Depreciation Metrics')).toBeInTheDocument()
    })
  })

  it('opens Add Asset modal when clicking Add Asset button', async () => {
    render(
      <MemoryRouter>
        <AssetInventoryPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add Asset/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Add Asset/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Provision New Asset/i })).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/MacBook Pro/i)).toBeInTheDocument()
    })
  })

  it('handles item selection and displays bulk action bar', async () => {
    render(
      <MemoryRouter>
        <AssetInventoryPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('MacBook Pro 16 M3 Max')).toBeInTheDocument()
    })

    const checkboxes = screen.getAllByRole('checkbox')
    // First is header select all, next are rows
    fireEvent.click(checkboxes[1])

    await waitFor(() => {
      expect(screen.getByText(/1 asset selected/i)).toBeInTheDocument()
      expect(screen.getByText('Mark In Stock')).toBeInTheDocument()
      expect(screen.getByText('Mark Maintenance')).toBeInTheDocument()
    })
  })

  it('displays empty state when no assets match filters', async () => {
    vi.mocked(assetService.getAssets).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 20,
      total_pages: 0,
    })

    render(
      <MemoryRouter>
        <AssetInventoryPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/Asset catalog is currently empty/i)).toBeInTheDocument()
    })
  })

  it('displays error state with retry button when API fails', async () => {
    vi.mocked(assetService.getAssets).mockRejectedValue(new Error('Network error'))

    render(
      <MemoryRouter>
        <AssetInventoryPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/Unable to synchronize assets/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Retry Connection/i })).toBeInTheDocument()
    })
  })
})
