import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MaintenanceTicketsPage } from '@/features/assets/pages/MaintenanceTicketsPage'
import { maintenanceService } from '@/features/assets/services/maintenanceService'
import type { MaintenanceTicket } from '@/features/assets/types/assets'
import { IT_ADMIN, mockUser, renderPage } from '@/test/render'

vi.mock('@/features/auth/services/authService', () => ({ authService: { getCurrentUser: vi.fn() } }))
vi.mock('@/features/assets/services/maintenanceService', () => ({
  maintenanceService: { list: vi.fn(), update: vi.fn(), pickableAssets: vi.fn().mockResolvedValue([]), assignees: vi.fn() },
}))

const ticket = (over: Partial<MaintenanceTicket>): MaintenanceTicket => ({
  id: 't1',
  asset_id: 'a1',
  asset_tag: 'AST-0031',
  asset_name: 'Dell P2422H',
  reported_by: 'u1',
  assigned_to: null,
  issue_description: 'Screen flickers after waking',
  priority: 'high',
  status: 'open',
  created_at: '2026-10-11T00:00:00Z',
  updated_at: '2026-10-11T00:00:00Z',
  reporter_name: 'Rohit Mehra',
  assignee_name: null,
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(maintenanceService.list).mockResolvedValue({
    items: [ticket({}), ticket({ id: 't2', issue_description: 'Keyboard sticky', status: 'resolved', priority: 'low' })],
    total: 2,
    page: 1,
    page_size: 100,
  })
  vi.mocked(maintenanceService.assignees).mockResolvedValue([{ id: 'me', full_name: 'Test User' }])
})

describe('Maintenance (§5.10)', () => {
  it('shows active tickets with asset, priority as a word and assignee', async () => {
    mockUser('it_admin', IT_ADMIN)
    renderPage(<MaintenanceTicketsPage />)
    const table = await screen.findByRole('table', { name: 'Tickets' })
    expect(within(table).getByText('Screen flickers after waking')).toBeInTheDocument()
    expect(within(table).queryByText('Keyboard sticky')).not.toBeInTheDocument()
    expect(within(table).getByText('High')).toBeInTheDocument()
    expect(within(table).getByText('Unassigned')).toBeInTheDocument()
  })

  it('lets IT change status and assignee from the panel', async () => {
    mockUser('it_admin', IT_ADMIN)
    vi.mocked(maintenanceService.update).mockResolvedValue(ticket({ status: 'in_progress', assigned_to: 'me' }))
    renderPage(<MaintenanceTicketsPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Open ticket: Screen flickers/ }))
    const panel = await screen.findByRole('dialog', { name: 'Ticket' })
    fireEvent.change(within(panel).getByLabelText('Status'), { target: { value: 'in_progress' } })
    await within(panel).findByRole('option', { name: 'Test User' })
    fireEvent.change(within(panel).getByLabelText('Assigned to'), { target: { value: 'me' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(maintenanceService.update).toHaveBeenCalledWith('t1', { status: 'in_progress', assigned_to: 'me' }))
  })

  it('shows the board with a column per status', async () => {
    mockUser('it_admin', IT_ADMIN)
    renderPage(<MaintenanceTicketsPage />, { route: '/maintenance?view=board' })
    expect(await screen.findByRole('region', { name: 'Open' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Resolved' })).toHaveTextContent('Keyboard sticky')
  })

  it('is read-only for people who only raise tickets', async () => {
    mockUser('employee', ['maintenance_ticket:create'])
    renderPage(<MaintenanceTicketsPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Open ticket: Screen flickers/ }))
    const panel = await screen.findByRole('dialog', { name: 'Ticket' })
    expect(within(panel).queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
    expect(within(panel).queryByLabelText('Assigned to')).not.toBeInTheDocument()
  })
})
