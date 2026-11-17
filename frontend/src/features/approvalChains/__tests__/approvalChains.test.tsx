import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApprovalChainConfigPage } from '@/features/approvalChains/pages/ApprovalChainConfigPage'
import { approvalChainService } from '@/features/approvalChains/services/approvalChainService'
import { mockUser, renderPage } from '@/test/render'

vi.mock('@/features/auth/services/authService', () => ({
  authService: { getCurrentUser: vi.fn() },
}))

vi.mock('@/features/approvalChains/services/approvalChainService', () => ({
  approvalChainService: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getAssignableRoles: vi.fn(),
  },
}))

describe('Approval Chain Configuration (§5.18)', () => {
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

    vi.mocked(approvalChainService.getAssignableRoles).mockResolvedValue([
      { id: 'r-mgr', name: 'manager', description: null, is_system_role: true },
      { id: 'r-it', name: 'it_admin', description: null, is_system_role: true },
      { id: 'r-sa', name: 'super_admin', description: null, is_system_role: true },
    ])
  })

  it('renders configured approval chain with horizontal stepper', async () => {
    renderPage(<ApprovalChainConfigPage />)

    expect(await screen.findByText('High-Value Hardware Approval')).toBeInTheDocument()
    expect(screen.getByText('Cost threshold: ≥ ₹50,000')).toBeInTheDocument()
    expect(screen.getByText('3 requests in flight')).toBeInTheDocument()

    // Stepper labels
    expect(screen.getByText('Department Manager')).toBeInTheDocument()
    expect(screen.getByText('IT Administrator')).toBeInTheDocument()
    expect(screen.getByText('Super Admin / Finance VP')).toBeInTheDocument()
  })

  it('displays in-flight versioning protection notice', async () => {
    renderPage(<ApprovalChainConfigPage />)

    expect(await screen.findByText('High-Value Hardware Approval')).toBeInTheDocument()
    expect(screen.getByText('Active Versioning Protection')).toBeInTheDocument()
    expect(
      screen.getByText(/3 requests are currently pending in flight/i),
    ).toBeInTheDocument()
  })

  it('restricts deleting template when pending requests are in flight', async () => {
    renderPage(<ApprovalChainConfigPage />)

    const deleteBtn = await screen.findByRole('button', { name: /Delete/i })
    fireEvent.click(deleteBtn)

    expect(await screen.findByText('Delete "High-Value Hardware Approval"?')).toBeInTheDocument()
    expect(
      screen.getByText(/In-flight requests must be approved or resolved before this approval chain can be removed/i),
    ).toBeInTheDocument()
    // Confirm delete button is not rendered while in-flight count > 0
    expect(screen.queryByRole('button', { name: 'Delete Chain' })).not.toBeInTheDocument()
  })

  it('opens new chain modal on clicking New Approval Chain', async () => {
    renderPage(<ApprovalChainConfigPage />)

    const newBtn = await screen.findByRole('button', { name: /New Approval Chain/i })
    fireEvent.click(newBtn)

    expect(await screen.findByText('Approval Steps Hierarchy')).toBeInTheDocument()
    expect(screen.getByLabelText(/Template Name/i)).toBeInTheDocument()
  })
})
