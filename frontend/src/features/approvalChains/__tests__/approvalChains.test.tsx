import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApprovalChainConfigPage } from '@/features/approvalChains/pages/ApprovalChainConfigPage'
import { approvalChainService } from '@/features/approvalChains/services/approvalChainService'
import { userManagementService } from '@/features/admin/services/userManagementService'
import { mockUser, renderPage } from '@/test/render'

vi.mock('@/features/auth/services/authService', () => ({
  authService: { getCurrentUser: vi.fn() },
}))

vi.mock('@/features/admin/services/userManagementService', () => ({ userManagementService: { assignableRoles: vi.fn() } }))
vi.mock('@/features/approvalChains/services/approvalChainService', () => ({
  approvalChainService: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('Approval Chain Configuration', () => {
  const mockTemplate = {
    id: 'chain-1',
    request_type: 'asset_request' as const,
    name: 'High-Value Hardware Approval',
    min_amount: 50000,
    is_active: true,
    steps: [
      { step_order: 1, approver_role_id: 'r-mgr', approver_role_name: 'manager' },
      { step_order: 2, approver_role_id: 'r-it', approver_role_name: 'it_admin' },
      { step_order: 3, approver_role_id: 'r-sa', approver_role_name: 'super_admin' },
    ],
    pending_request_count: 3,
    created_at: '2026-11-17T10:00:00.000Z',
    updated_at: '2026-11-17T10:00:00.000Z',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUser('super_admin', ['approval_chain:read', 'approval_chain:create', 'approval_chain:update', 'approval_chain:delete'])

    vi.mocked(approvalChainService.list).mockResolvedValue({
      templates: [mockTemplate],
    })

    vi.mocked(userManagementService.assignableRoles).mockResolvedValue([
      { id: 'r-mgr', name: 'manager', description: null, is_system_role: true },
      { id: 'r-it', name: 'it_admin', description: null, is_system_role: true },
      { id: 'r-sa', name: 'super_admin', description: null, is_system_role: true },
    ])
  })

  it('shows each chain with its kind, cost and approvers in order', async () => {
    renderPage(<ApprovalChainConfigPage />)
    expect(await screen.findByRole('heading', { name: 'High-Value Hardware Approval' })).toBeInTheDocument()
    expect(screen.getByText(/Equipment · ₹50,000 and above/)).toBeInTheDocument()
    expect(screen.getByText(/3 requests waiting/)).toBeInTheDocument()
    const approvers = screen.getByRole('list', { name: 'Approvers, in order' })
    expect(approvers).toHaveTextContent('Their manager')
    expect(approvers).toHaveTextContent('IT admin')
    expect(approvers).toHaveTextContent('Super admin')
  })

  it('says plainly that changes only affect new requests', async () => {
    renderPage(<ApprovalChainConfigPage />)
    expect(await screen.findByText(/Changes apply to new requests; ones already waiting keep their approvers/)).toBeInTheDocument()
  })

  it('won’t delete a chain that requests are still waiting on', async () => {
    renderPage(<ApprovalChainConfigPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Delete High-Value Hardware Approval' }))
    expect(await screen.findByRole('dialog', { name: 'Delete “High-Value Hardware Approval”?' })).toBeInTheDocument()
    expect(screen.getByText(/3 requests are still waiting on this chain/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Yes, delete' })).not.toBeInTheDocument()
  })

  it('offers only roles that can approve, and blocks a second manager step', async () => {
    vi.mocked(userManagementService.assignableRoles).mockResolvedValue([
      { id: 'r-mgr', name: 'manager', description: null, is_system_role: true },
      { id: 'r-it', name: 'it_admin', description: null, is_system_role: true },
      { id: 'r-emp', name: 'employee', description: null, is_system_role: true },
      { id: 'r-aud', name: 'auditor', description: null, is_system_role: true },
    ])
    renderPage(<ApprovalChainConfigPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'New chain' }))
    const dialog = await screen.findByRole('dialog', { name: 'New approval chain' })
    const first = (await within(dialog).findByLabelText('Approver 1')) as HTMLSelectElement
    expect(Array.from(first.options).map((o) => o.text)).toEqual(['Manager', 'IT admin'])
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Two managers' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /Add approver/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create chain' }))
    expect(await within(dialog).findByText(/only one Manager step/)).toBeInTheDocument()
    expect(approvalChainService.create).not.toHaveBeenCalled()
  })
})
