import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SoftwareLicensesPage } from '@/features/licenses/pages/SoftwareLicensesPage'
import { licenseService } from '@/features/licenses/services/licenseService'
import { mockUser, renderPage } from '@/test/render'

vi.mock('@/features/auth/services/authService', () => ({
  authService: { getCurrentUser: vi.fn() },
}))

vi.mock('@/features/licenses/services/licenseService', () => ({
  licenseService: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    getHolders: vi.fn(),
  },
}))

describe('Software License Management (§5.19)', () => {
  const mockLicense = {
    id: 'lic-1',
    name: 'Figma Organization',
    vendor: 'Figma, Inc.',
    total_seats: 50,
    seats_used: 47, // 94% -> triggers warn amber
    cost_per_seat: 1500,
    renewal_date: '2027-06-15',
    created_at: '2026-11-17T10:00:00.000Z',
    updated_at: '2026-11-17T10:00:00.000Z',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUser('it_admin', ['software_license:read', 'software_license:create', 'software_license:update'])

    vi.mocked(licenseService.list).mockResolvedValue({
      items: [mockLicense],
      total: 1,
    })

    vi.mocked(licenseService.getHolders).mockResolvedValue({
      holders: [
        {
          employee_id: 'emp-1',
          full_name: 'Ananya Sharma',
          email: 'ananya@rosterly.internal',
          asset_id: 'ast-10',
          asset_tag: 'RST-MBP-0012',
          asset_name: 'MacBook Pro 14"',
        },
      ],
    })
  })

  it('renders license summary cards and table with utilization percentage', async () => {
    renderPage(<SoftwareLicensesPage />)

    expect(await screen.findByText('Figma Organization')).toBeInTheDocument()
    expect(screen.getByText('Software Licences')).toBeInTheDocument()
    expect(screen.getByText('Figma, Inc.')).toBeInTheDocument()
    expect(screen.getByText('47 / 50')).toBeInTheDocument()
    expect(screen.getAllByText('94%').length).toBeGreaterThanOrEqual(1)
  })

  it('opens seat inspector drawer and displays holders with asset tags', async () => {
    renderPage(<SoftwareLicensesPage />)

    const rowButton = await screen.findByRole('button', {
      name: /View seat holders for Figma Organization/i,
    })
    fireEvent.click(rowButton)

    expect(await screen.findByText('Assigned Seat Holders')).toBeInTheDocument()
    expect(await screen.findByText('Ananya Sharma')).toBeInTheDocument()
    expect(screen.getByText('RST-MBP-0012')).toBeInTheDocument()
    expect(screen.getByText('MacBook Pro 14"')).toBeInTheDocument()
  })

  it('opens Add License modal on clicking Add Licence button', async () => {
    renderPage(<SoftwareLicensesPage />)

    const addBtn = await screen.findByRole('button', { name: /Add Licence/i })
    fireEvent.click(addBtn)

    expect(await screen.findByText('Add Software Licence')).toBeInTheDocument()
    expect(screen.getByLabelText(/Licence Name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Total Entitled Seats/i)).toBeInTheDocument()
  })
})
