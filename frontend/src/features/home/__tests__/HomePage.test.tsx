import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HomePage } from '@/features/home/pages/HomePage'
import { homeService } from '@/features/home/services/homeService'
import { inboxService } from '@/features/inbox/services/inboxService'
import { authService } from '@/features/auth/services/authService'
import type { InboxResponse } from '@/features/inbox/types/inbox'

vi.mock('@/features/inbox/services/inboxService', () => ({
  inboxService: {
    getInbox: vi.fn(),
    approveRequest: vi.fn(),
    rejectRequest: vi.fn(),
    updateChecklistItem: vi.fn(),
    updateTicket: vi.fn(),
  },
}))
vi.mock('@/features/home/services/homeService', () => ({
  HOME_SUMMARY_KEY: ['inbox', 'home-summary'],
  homeService: { summary: vi.fn() },
}))
vi.mock('@/features/auth/services/authService', () => ({
  authService: { getCurrentUser: vi.fn() },
}))

const INBOX: InboxResponse = {
  counts: { decisions: 1, tasks: 1, tickets: 0 },
  done_today: [{ id: 'approval:r0:1', kind: 'approval', title: 'Ergonomic keyboard', outcome: 'Approved', done_at: new Date().toISOString() }],
  items: [
    {
      id: 'approval:r1',
      kind: 'approval',
      title: 'MacBook Pro for ML work',
      meta: 'Asset request · ₹2,49,900',
      created_at: new Date().toISOString(),
      approval: {
        request_id: 'r1',
        request_type: 'asset_request',
        description: 'Needs more GPU memory.',
        priority: 'high',
        estimated_cost: '249900',
        requester: { id: 'u1', full_name: 'Ava White', department: 'Engineering' },
        related_asset: null,
        current_step: 2,
        total_steps: 3,
        chain: [
          { step_order: 1, role_name: 'manager', approver_name: 'Rachel Green', status: 'approved', is_current: false },
          { step_order: 2, role_name: 'it_admin', approver_name: null, status: 'pending', is_current: true },
          { step_order: 3, role_name: 'super_admin', approver_name: null, status: 'pending', is_current: false },
        ],
        checks: [
          { status: 'attention', text: '₹2,49,900 is at or above the ₹50,000 high-value threshold.' },
          { status: 'info', text: 'Ava has no assets assigned right now.' },
        ],
        attention_count: 1,
      },
      task: null,
      ticket: null,
    },
    {
      id: 'task:i1',
      kind: 'task',
      title: 'Provision laptop',
      meta: 'Onboarding · Neha Singh · joins 20 Oct',
      created_at: new Date().toISOString(),
      approval: null,
      task: {
        checklist_id: 'c1',
        item_id: 'i1',
        checklist_type: 'onboarding',
        task_name: 'Provision laptop',
        status: 'pending',
        employee: { id: 'u2', full_name: 'Neha Singh', department: 'Design' },
        key_date: '2026-10-20',
        asset: null,
      },
      ticket: null,
    },
  ],
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Home with the Inbox (§5.2, §5.2a)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Wide layout: list and detail side by side
    window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    vi.mocked(authService.getCurrentUser).mockResolvedValue({
      id: 'me', email: 'it@example.com', full_name: 'Miles Dyson', role: 'it_admin',
      permissions: ['request:approve', 'request:create'],
    })
    vi.mocked(inboxService.getInbox).mockResolvedValue(INBOX)
    vi.mocked(homeService.summary).mockResolvedValue({
      role: 'it_admin',
      metrics: { open_maintenance_tickets_count: 4, warranty_expiring_count: 2, available_stock_count: 5, total_assets_count: 24 },
      widgets: {},
    })
  })

  it('groups items, summarises the count and opens the first decision', async () => {
    renderPage()
    expect(await screen.findByText('2 open · 1 done today')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Waiting on you' })).toBeInTheDocument()
    expect(screen.getByText('Needs your decision')).toBeInTheDocument()
    expect(screen.getByText('Your tasks')).toBeInTheDocument()
    expect(screen.getByText('Done today')).toBeInTheDocument()
    expect(screen.getByText('Rosterly checked this request')).toBeInTheDocument()
    expect(screen.getByText('1 thing to look at')).toBeInTheDocument()
    expect(screen.getByText('You · IT admin')).toBeInTheDocument()
    expect(screen.getByText('Rachel Green approved')).toBeInTheDocument()
  })

  it('approves through the requests endpoint and moves to the next item', async () => {
    vi.mocked(inboxService.approveRequest).mockResolvedValue()
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(inboxService.approveRequest).toHaveBeenCalledWith('r1'))
    expect(await screen.findByRole('button', { name: 'Mark done' })).toBeInTheDocument()
  })

  it('requires a reason before rejecting', async () => {
    vi.mocked(inboxService.rejectRequest).mockResolvedValue()
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }))
    const confirm = screen.getByRole('button', { name: 'Reject request' })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Reason for Ava'), { target: { value: 'A spare is in stock.' } })
    fireEvent.click(confirm)
    await waitFor(() => expect(inboxService.rejectRequest).toHaveBeenCalledWith('r1', 'A spare is in stock.'))
  })

  it('marks a checklist task done through the lifecycle endpoint', async () => {
    vi.mocked(inboxService.updateChecklistItem).mockResolvedValue()
    renderPage()
    fireEvent.click(await screen.findByText('Provision laptop'))
    fireEvent.click(screen.getByRole('button', { name: 'Mark done' }))
    await waitFor(() =>
      expect(inboxService.updateChecklistItem).toHaveBeenCalledWith('onboarding', 'c1', 'i1', 'done'),
    )
  })

  it('collapses tasks that share a title into one expandable row', async () => {
    const base = INBOX.items[1]
    const clone = (n: number, name: string) => ({
      ...base,
      id: `task:i${n}`,
      meta: `Onboarding · ${name} · joins 2${n} Oct`,
      task: { ...base.task!, item_id: `i${n}`, employee: { id: `p${n}`, full_name: name, department: null } },
    })
    vi.mocked(inboxService.getInbox).mockResolvedValue({
      ...INBOX,
      items: [INBOX.items[0], clone(1, 'Neha Singh'), clone(2, 'Arjun Rao')],
    })
    renderPage()
    const cluster = await screen.findByRole('button', { name: /Provision laptop\s*2 people/ })
    expect(cluster).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(cluster)
    expect(screen.getByText('Arjun Rao')).toBeInTheDocument()
    expect(screen.getByText('Onboarding · joins 22 Oct')).toBeInTheDocument()
  })

  it('shows the role’s numbers, each linking to the list behind it', async () => {
    renderPage()
    const tickets = await screen.findByRole('link', { name: /Open tickets\s*4\s*Open or in progress/ })
    expect(tickets).toHaveAttribute('href', '/maintenance')
    expect(screen.getByRole('link', { name: /In stock\s*5/ })).toHaveAttribute('href', '/assets?status=in_stock')
  })

  it('merges the numbers of every role held, each card once (§5.14)', async () => {
    vi.mocked(authService.getCurrentUser).mockResolvedValue({
      id: 'me', email: 'it@example.com', full_name: 'Miles Dyson', role: 'manager', roles: ['manager', 'it_admin'],
      permissions: ['request:approve', 'request:create'],
    })
    vi.mocked(homeService.summary).mockResolvedValue({
      role: 'manager',
      metrics: { open_maintenance_tickets_count: 4, team_headcount: 6, my_open_requests_count: 1 },
      widgets: {},
    })
    renderPage()
    expect(await screen.findByText('Manager + IT admin', { exact: false })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /Open tickets\s*4/ })).toBeInTheDocument() // IT admin's
    expect(screen.getByRole('link', { name: /Team\s*6/ })).toBeInTheDocument() // manager's
    expect(screen.getAllByRole('link', { name: /^Waiting/ })).toHaveLength(1)
  })

  it('gives employees their equipment and requests when nothing is waiting', async () => {
    vi.mocked(authService.getCurrentUser).mockResolvedValue({
      id: 'me', email: 'e@example.com', full_name: 'Alex Murphy', role: 'employee', permissions: ['request:create'],
    })
    vi.mocked(inboxService.getInbox).mockResolvedValue({ items: [], done_today: [], counts: { decisions: 0, tasks: 0, tickets: 0 } })
    vi.mocked(homeService.summary).mockResolvedValue({
      role: 'employee',
      metrics: { my_assigned_assets_count: 1, my_open_requests_count: 1, pending_tasks_count: 0 },
      widgets: {
        my_assigned_assets: [{ id: 'a1', name: 'ThinkPad X1', asset_tag: 'AST-0005', category: 'laptop', assigned_at: '2026-01-10T00:00:00Z' }],
        my_open_requests: [{ id: 'r9', title: '27-inch monitor', request_type: 'asset_request', status: 'pending', created_at: '2026-10-10T00:00:00Z' }],
      },
    })
    renderPage()
    expect(await screen.findByText('Nothing open')).toBeInTheDocument()
    expect(await screen.findByText('ThinkPad X1')).toBeInTheDocument()
    expect(screen.getByText('27-inch monitor')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /New request/ })).toHaveAttribute('href', '/requests?new=1')
  })
})
