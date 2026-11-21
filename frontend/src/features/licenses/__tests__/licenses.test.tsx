import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SoftwareLicensesPage } from '@/features/licenses/pages/SoftwareLicensesPage'
import { licenseService } from '@/features/licenses/services/licenseService'
import { employeeService } from '@/features/employees/services/employeeService'
import type { LicenseItem } from '@/features/licenses/types/licenses'
import { mockUser, renderPage } from '@/test/render'

vi.mock('@/features/auth/services/authService', () => ({ authService: { getCurrentUser: vi.fn() } }))
vi.mock('@/features/licenses/services/licenseService', () => ({
  licenseService: { list: vi.fn(), create: vi.fn(), update: vi.fn(), getHolders: vi.fn(), assignSeat: vi.fn(), removeSeat: vi.fn() },
}))
vi.mock('@/features/employees/services/employeeService', () => ({ employeeService: { getEmployees: vi.fn() } }))

const licence = (over: Partial<LicenseItem> = {}): LicenseItem => ({
  id: 'lic-1',
  name: 'Figma Organization',
  vendor: 'Figma, Inc.',
  total_seats: 50,
  seats_used: 47,
  cost_per_seat: 1500,
  renewal_date: '2027-06-15',
  source: 'manual',
  created_at: '2026-11-17T10:00:00.000Z',
  updated_at: '2026-11-17T10:00:00.000Z',
  ...over,
})

const holders = {
  holders: [{ assignment_id: 'a1', employee_id: 'u1', full_name: 'Aisha Patel', email: 'aisha@example.com', source: 'manual', assigned_at: '2026-10-01T00:00:00Z' }],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUser('it_admin', ['software_license:read', 'software_license:create', 'software_license:update'])
  vi.mocked(licenseService.list).mockResolvedValue({ items: [licence()], total: 1 })
  vi.mocked(licenseService.getHolders).mockResolvedValue(holders)
  vi.mocked(employeeService.getEmployees).mockResolvedValue({
    items: [{ id: 'u2', full_name: 'Rahul Verma', designation: 'Designer' }],
    total: 1,
    page: 1,
    page_size: 6,
  } as never)
})

const openFigma = async () => {
  fireEvent.click(await screen.findByText('Figma Organization'))
  return screen.findByRole('dialog', { name: 'Figma Organization' })
}

describe('Licences', () => {
  it('lists licences with seats in use', async () => {
    renderPage(<SoftwareLicensesPage />)
    expect(await screen.findByRole('heading', { name: 'Licences' })).toBeInTheDocument()
    expect(await screen.findByText('Figma Organization')).toBeInTheDocument()
  })

  it('shows who has a seat and lets IT give and free seats', async () => {
    vi.mocked(licenseService.assignSeat).mockResolvedValue(holders)
    vi.mocked(licenseService.removeSeat).mockResolvedValue({ holders: [] })
    renderPage(<SoftwareLicensesPage />)
    const panel = await openFigma()
    expect(await within(panel).findByText('Aisha Patel')).toBeInTheDocument()

    fireEvent.change(within(panel).getByLabelText('Person'), { target: { value: 'Rahul' } })
    fireEvent.click(await within(panel).findByRole('button', { name: 'Give Rahul Verma a seat' }))
    await waitFor(() => expect(licenseService.assignSeat).toHaveBeenCalledWith('lic-1', 'u2'))

    fireEvent.click(within(panel).getByRole('button', { name: 'Free Aisha Patel’s seat' }))
    await waitFor(() => expect(licenseService.removeSeat).toHaveBeenCalledWith('lic-1', 'a1'))
  })

  it('does not let IT change seats that come from a connected provider', async () => {
    vi.mocked(licenseService.list).mockResolvedValue({ items: [licence({ source: 'microsoft_365' })], total: 1 })
    vi.mocked(licenseService.getHolders).mockResolvedValue({ holders: [{ ...holders.holders[0], source: 'microsoft_365' }] })
    renderPage(<SoftwareLicensesPage />)
    const panel = await openFigma()
    expect(await within(panel).findByText(/Microsoft 365/)).toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: /Free/ })).not.toBeInTheDocument()
    expect(within(panel).queryByLabelText('Person')).not.toBeInTheDocument()
  })

  it('opens the add licence form with plain labels', async () => {
    renderPage(<SoftwareLicensesPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Add licence/i }))
    const dialog = await screen.findByRole('dialog', { name: 'Add licence' })
    expect(within(dialog).getByLabelText('Seats bought')).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/Price per seat a year/)).toBeInTheDocument()
  })
})
