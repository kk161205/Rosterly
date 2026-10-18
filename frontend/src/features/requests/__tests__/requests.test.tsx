import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UnifiedRequestsPage } from '@/features/requests/pages/UnifiedRequestsPage'
import { requestService } from '@/features/requests/services/requestService'
import type { RequestDetail, RequestSummary } from '@/features/requests/types/requests'
import { mockUser, renderPage } from '@/test/render'

vi.mock('@/features/auth/services/authService', () => ({ authService: { getCurrentUser: vi.fn() } }))
vi.mock('@/features/requests/services/requestService', () => ({
  requestService: { mine: vi.fn(), get: vi.fn(), create: vi.fn(), cancel: vi.fn() },
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

describe('Requests (§5.11)', () => {
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
})
