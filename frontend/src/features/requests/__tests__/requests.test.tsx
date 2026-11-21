import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UnifiedRequestsPage } from '@/features/requests/pages/UnifiedRequestsPage'
import { requestService } from '@/features/requests/services/requestService'
import type { RequestDetail, RequestSummary } from '@/features/requests/types/requests'
import { mockUser, renderPage } from '@/test/render'

vi.mock('@/features/auth/services/authService', () => ({ authService: { getCurrentUser: vi.fn() } }))
vi.mock('@/features/requests/services/requestService', () => ({
  requestService: { mine: vi.fn(), get: vi.fn(), create: vi.fn(), cancel: vi.fn(), toFulfil: vi.fn(), fulfil: vi.fn() },
}))

const summary: RequestSummary = {
  id: 'r1',
  requester_id: 'me',
  requester_name: 'Test User',
  requester_department: 'Design',
  request_type: 'asset_request',
  title: '27-inch monitor',
  description: 'For design reviews.',
  related_asset_id: null,
  related_asset_name: null,
  estimated_cost: '18500',
  priority: 'medium',
  status: 'pending',
  current_step: 2,
  total_steps: 2,
  waiting_on_role: 'it_admin',
  fulfilment_note: null,
  fulfilled_by_name: null,
  fulfilled_at: null,
  created_at: '2026-10-10T00:00:00Z',
  updated_at: '2026-10-10T00:00:00Z',
}

const detail: RequestDetail = {
  ...summary,
  approvals: [
    { id: 'ap1', step_order: 1, approver_id: 'm', approver_name: 'Rohit Mehra', approver_role_name: 'manager', status: 'approved', decision_at: '2026-10-11T00:00:00Z', comments: 'Fine by me', created_at: '2026-10-10T00:00:00Z' },
    { id: 'ap2', step_order: 2, approver_id: null, approver_name: null, approver_role_name: 'it_admin', status: 'pending', decision_at: null, comments: null, created_at: '2026-10-10T00:00:00Z' },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUser('employee', ['request:create', 'request:read'])
  vi.mocked(requestService.mine).mockResolvedValue({ items: [summary], total: 1, page: 1, page_size: 20 })
  vi.mocked(requestService.get).mockResolvedValue(detail)
})

describe('Requests', () => {
  it('says where each request stands in plain words', async () => {
    renderPage(<UnifiedRequestsPage />)
    const table = await screen.findByRole('table', { name: 'Your requests' })
    expect(within(table).getByText('Waiting on IT admin')).toBeInTheDocument()
    expect(within(table).getByText('Step 2 of 2')).toBeInTheDocument()
  })

  it('shows the approval timeline and lets the requester cancel', async () => {
    vi.mocked(requestService.cancel).mockResolvedValue({ ...detail, status: 'cancelled' })
    renderPage(<UnifiedRequestsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open request: 27-inch monitor' }))
    const panel = await screen.findByRole('dialog', { name: '27-inch monitor' })
    expect(await within(panel).findByText('Rohit Mehra approved')).toBeInTheDocument()
    expect(within(panel).getByText('“Fine by me”')).toBeInTheDocument()
    fireEvent.click(within(panel).getByRole('button', { name: 'Cancel request' }))
    const confirm = await screen.findByRole('dialog', { name: 'Cancel this request?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel request' }))
    await waitFor(() => expect(requestService.cancel).toHaveBeenCalledWith('r1'))
  })

  it('submits a new request with type, details and cost', async () => {
    vi.mocked(requestService.create).mockResolvedValue({ ...detail, id: 'r2' })
    renderPage(<UnifiedRequestsPage />)
    fireEvent.click(await screen.findByRole('button', { name: /New request/ }))
    const dialog = await screen.findByRole('dialog', { name: 'New request' })
    fireEvent.click(within(dialog).getByRole('radio', { name: /Access/ }))
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Figma seat' } })
    fireEvent.change(within(dialog).getByLabelText('Details'), { target: { value: 'Need edit access for design reviews.' } })
    fireEvent.change(within(dialog).getByLabelText(/Cost per month/), { target: { value: '1200' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Submit request' }))
    await waitFor(() =>
      expect(requestService.create).toHaveBeenCalledWith({
        request_type: 'access_request',
        title: 'Figma seat',
        description: 'Need edit access for design reviews.',
        priority: 'medium',
        estimated_cost: 1200,
      }),
    )
  })

  it('explains a missing approval route instead of a raw error', async () => {
    vi.mocked(requestService.create).mockRejectedValue({ response: { status: 409, data: { error: { code: 'no_approval_chain', message: 'x' } } } })
    renderPage(<UnifiedRequestsPage />)
    fireEvent.click(await screen.findByRole('button', { name: /New request/ }))
    const dialog = await screen.findByRole('dialog', { name: 'New request' })
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Chair' } })
    fireEvent.change(within(dialog).getByLabelText('Details'), { target: { value: 'Back support' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Submit request' }))
    expect(await within(dialog).findByText(/no approval route set up/)).toBeInTheDocument()
  })

  it('marks a request urgent with one checkbox', async () => {
    vi.mocked(requestService.create).mockResolvedValue({ ...detail, id: 'r3' })
    renderPage(<UnifiedRequestsPage />)
    fireEvent.click(await screen.findByRole('button', { name: /New request/ }))
    const dialog = await screen.findByRole('dialog', { name: 'New request' })
    expect(within(dialog).queryByLabelText('Priority')).not.toBeInTheDocument()
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Laptop broke' } })
    fireEvent.change(within(dialog).getByLabelText('Details'), { target: { value: 'Will not boot.' } })
    fireEvent.click(within(dialog).getByLabelText('This is urgent'))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Submit request' }))
    await waitFor(() => expect(requestService.create).toHaveBeenCalledWith(expect.objectContaining({ priority: 'high' })))
  })

  it('lets IT start and finish an approved request from To fulfil', async () => {
    mockUser('it_admin', ['request:create', 'request:read', 'request:fulfil'])
    const approved = { ...summary, status: 'approved' as const, requester_name: 'Kavya Rao' }
    vi.mocked(requestService.toFulfil).mockResolvedValue({ items: [approved], total: 1, page: 1, page_size: 20 })
    vi.mocked(requestService.get).mockResolvedValue({ ...detail, ...approved })
    vi.mocked(requestService.fulfil).mockResolvedValue({ ...detail, ...approved, status: 'in_progress' })
    renderPage(<UnifiedRequestsPage />, { route: '/requests?view=fulfil' })
    fireEvent.click(await screen.findByRole('button', { name: 'Open request: 27-inch monitor' }))
    const panel = await screen.findByRole('dialog', { name: '27-inch monitor' })
    fireEvent.click(await within(panel).findByRole('button', { name: 'Start work' }))
    const confirm = await screen.findByRole('dialog', { name: 'Start work on this request?' })
    fireEvent.change(within(confirm).getByLabelText(/Note for the requester/), { target: { value: 'Ordered' } })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Start work' }))
    await waitFor(() => expect(requestService.fulfil).toHaveBeenCalledWith('r1', 'in_progress', 'Ordered'))
  })
})
