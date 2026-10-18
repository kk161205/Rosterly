import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AssetInventoryPage } from '@/features/assets/pages/AssetInventoryPage'
import { AssetDetailPage } from '@/features/assets/pages/AssetDetailPage'
import { AssetQRScannerPage } from '@/features/assets/pages/AssetQRScannerPage'
import { assetService } from '@/features/assets/services/assetService'
import type { Asset } from '@/features/assets/types/assets'
import { IT_ADMIN, mockUser, renderPage } from '@/test/render'

vi.mock('@/features/auth/services/authService', () => ({ authService: { getCurrentUser: vi.fn() } }))
vi.mock('@/features/assets/services/assetService', () => ({
  assetService: {
    getAssets: vi.fn(),
    getAssetSummary: vi.fn(),
    countByStatus: vi.fn(),
    getAssetMeta: vi.fn(),
    getAssetDetail: vi.fn(),
    getAssetAssignments: vi.fn(),
    getAssetMaintenance: vi.fn(),
    lookupAssetByTag: vi.fn(),
    updateAsset: vi.fn(),
    bulkUpdateAssets: vi.fn(),
    returnAsset: vi.fn(),
  },
}))

const asset = (over: Partial<Asset> = {}): Asset => ({
  id: 'a1',
  asset_tag: 'AST-0001',
  name: 'MacBook Air M2',
  category: 'laptop',
  serial_number: 'C02XYZ',
  vendor: 'Apple India',
  purchase_date: '2025-06-12',
  purchase_cost: '114900',
  current_value: '78400',
  depreciation_method: 'straight_line',
  useful_life_months: 48,
  warranty_expiry: '2027-06-14',
  amc_expiry: null,
  status: 'assigned',
  current_holder_id: 'u1',
  current_holder: { id: 'u1', full_name: 'Aman Gupta', email: 'aman@example.com', department_name: 'Design' },
  created_at: '2025-06-12T00:00:00Z',
  updated_at: '2025-06-12T00:00:00Z',
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockUser('it_admin', IT_ADMIN)
  vi.mocked(assetService.getAssetSummary).mockResolvedValue({ total: 42, deployed: 30, inStock: 9, underMaintenance: 3 })
  vi.mocked(assetService.countByStatus).mockResolvedValue(0)
  vi.mocked(assetService.getAssetMeta).mockResolvedValue({ categories: ['laptop', 'monitor'], statuses: [] })
  vi.mocked(assetService.getAssets).mockResolvedValue({
    items: [asset(), asset({ id: 'a2', asset_tag: 'AST-0002', name: 'Dell P2422H', status: 'in_stock', current_holder: null, current_holder_id: null })],
    total: 2,
    page: 1,
    page_size: 20,
    total_pages: 1,
  })
})

describe('Assets list (§5.7)', () => {
  it('shows status tabs with server counts and the asset table', async () => {
    renderPage(<AssetInventoryPage />)
    expect(await screen.findByRole('button', { name: /All\s*42/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /In stock\s*9/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /In repair\s*3/ })).toBeInTheDocument()
    const table = await screen.findByRole('table', { name: 'Assets' })
    expect(within(table).getByText('MacBook Air M2')).toBeInTheDocument()
    expect(within(table).getByText('Aman Gupta')).toBeInTheDocument()
  })

  it('filters by status through the API', async () => {
    renderPage(<AssetInventoryPage />)
    fireEvent.click(await screen.findByRole('button', { name: /In stock/ }))
    await waitFor(() => expect(assetService.getAssets).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'in_stock' })))
  })

  it('opens a side panel with the next action for the asset', async () => {
    renderPage(<AssetInventoryPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open Dell P2422H' }))
    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByRole('button', { name: 'Assign' })).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'Open full record and history' })).toHaveAttribute('href', '/assets/a2')
  })

  it('lets IT edit an asset and change its status from the panel', async () => {
    renderPage(<AssetInventoryPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open Dell P2422H' }))
    const panel = await screen.findByRole('dialog')
    fireEvent.click(within(panel).getByRole('button', { name: 'Edit details' }))
    expect(await screen.findByRole('dialog', { name: 'Edit details' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Dell P2422H')
  })

  it('keeps the panel read-only for roles that cannot edit', async () => {
    mockUser('auditor', ['assets:read'])
    renderPage(<AssetInventoryPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open Dell P2422H' }))
    const panel = await screen.findByRole('dialog')
    expect(within(panel).queryByRole('button', { name: 'Edit details' })).not.toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: 'Change status' })).not.toBeInTheDocument()
  })

  it('offers bulk status change once rows are selected', async () => {
    renderPage(<AssetInventoryPage />)
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select MacBook Air M2' }))
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Change status' }))
    expect(await screen.findByRole('dialog', { name: /Change status of 1 assets|Change status/ })).toBeInTheDocument()
  })

  it('hides create and bulk actions from read-only roles', async () => {
    mockUser('auditor', ['assets:read'])
    renderPage(<AssetInventoryPage />)
    await screen.findByRole('table', { name: 'Assets' })
    expect(screen.queryByRole('button', { name: /Add asset/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('shows an empty state with a way back when filters match nothing', async () => {
    vi.mocked(assetService.getAssets).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20, total_pages: 0 })
    renderPage(<AssetInventoryPage />, { route: '/assets?status=retired' })
    expect(await screen.findByText('No assets match')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument()
  })
})

describe('Asset record (§5.8)', () => {
  beforeEach(() => {
    vi.mocked(assetService.getAssetDetail).mockResolvedValue({
      asset: asset(),
      current_assignment: {
        id: 's1', asset_id: 'a1', employee_id: 'u1', assigned_by: 'me', assigned_at: '2025-06-14T10:00:00Z',
        condition_at_assignment: 'New', employee_name: 'Aman Gupta', assigned_by_name: 'Test User',
      },
    })
    vi.mocked(assetService.getAssetAssignments).mockResolvedValue([
      {
        id: 's1', asset_id: 'a1', employee_id: 'u1', assigned_by: 'me', assigned_at: '2025-06-14T10:00:00Z',
        condition_at_assignment: 'New', employee_name: 'Aman Gupta', assigned_by_name: 'Test User',
      },
    ])
    vi.mocked(assetService.getAssetMaintenance).mockResolvedValue([
      {
        id: 't1', asset_id: 'a1', reported_by: 'u1', issue_description: 'Battery drains overnight', priority: 'high',
        status: 'open', created_at: '2026-10-01T09:00:00Z', updated_at: '2026-10-01T09:00:00Z', reporter_name: 'Aman Gupta',
      },
    ])
  })

  it('shows holder, details, activity, book value and open tickets', async () => {
    renderPage(<AssetDetailPage />, { route: '/assets/a1', path: '/assets/:id' })
    expect(await screen.findByRole('heading', { level: 1, name: 'MacBook Air M2' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Aman Gupta' })).toHaveAttribute('href', '/employees/u1')
    expect(screen.getByRole('button', { name: 'Return to stock' })).toBeInTheDocument()
    expect(screen.getByText('Straight line over 48 months')).toBeInTheDocument()
    expect(await screen.findByText('Assigned to Aman Gupta')).toBeInTheDocument()
    expect(screen.getByText('68% of ₹1,14,900 · recalculated nightly')).toBeInTheDocument()
    expect(screen.getAllByText('Battery drains overnight').length).toBeGreaterThan(0)
  })

  it('filters the activity timeline', async () => {
    renderPage(<AssetDetailPage />, { route: '/assets/a1', path: '/assets/:id' })
    fireEvent.click(await screen.findByRole('button', { name: 'Maintenance' }))
    expect(screen.queryByText('Assigned to Aman Gupta')).not.toBeInTheDocument()
    expect(screen.getByText('Ticket raised')).toBeInTheDocument()
  })
})

describe('QR check-in / check-out (§5.9)', () => {
  it('finds an asset by typed tag using the lookup endpoint', async () => {
    vi.mocked(assetService.lookupAssetByTag).mockResolvedValue({ asset: asset({ status: 'in_stock', current_holder: null }) })
    renderPage(<AssetQRScannerPage />)
    fireEvent.change(await screen.findByLabelText('Asset tag'), { target: { value: 'ast-0001' } })
    fireEvent.click(screen.getByRole('button', { name: 'Find' }))
    await waitFor(() => expect(assetService.lookupAssetByTag).toHaveBeenCalledWith('AST-0001'))
    expect(await screen.findByRole('button', { name: 'Assign to someone' })).toBeInTheDocument()
  })

  it('says plainly when no asset has the tag', async () => {
    vi.mocked(assetService.lookupAssetByTag).mockRejectedValue({ isAxiosError: true, response: { status: 404, data: {} } })
    renderPage(<AssetQRScannerPage />)
    fireEvent.change(await screen.findByLabelText('Asset tag'), { target: { value: 'AST-9999' } })
    fireEvent.click(screen.getByRole('button', { name: 'Find' }))
    expect(await screen.findByText('No asset has the tag AST-9999.')).toBeInTheDocument()
  })
})
