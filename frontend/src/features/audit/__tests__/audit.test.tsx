import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuditLogViewerPage } from '@/features/audit/pages/AuditLogViewerPage'
import { auditService } from '@/features/audit/services/auditService'
import * as exportModule from '@/features/audit/lib/exportAuditCsv'
import { mockUser, renderPage } from '@/test/render'

vi.mock('@/features/auth/services/authService', () => ({
  authService: { getCurrentUser: vi.fn() },
}))

vi.mock('@/features/audit/services/auditService', () => ({
  auditService: {
    list: vi.fn(),
  },
}))

describe('Audit Log Viewer (§5.17)', () => {
  const mockItem = {
    id: 'aud-101',
    actor: {
      id: 'usr-1',
      full_name: 'Priya Patel',
      email: 'priya@rosterly.internal',
    },
    action: 'role_assigned',
    entity_type: 'user',
    entity_id: 'usr-202',
    before_state: { role: 'employee' },
    after_state: { role: 'manager', department: 'Engineering' },
    ip_address: '192.168.1.50',
    created_at: '2026-11-17T10:00:00.000Z',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUser('super_admin', ['audit_log:read'])

    vi.mocked(auditService.list).mockResolvedValue({
      items: [mockItem],
      total: 1,
    })
  })

  it('renders chronological audit event stream table', async () => {
    renderPage(<AuditLogViewerPage />)

    expect(await screen.findByText('Audit Log')).toBeInTheDocument()
    expect(await screen.findByText('Priya Patel')).toBeInTheDocument()
    expect(screen.getByText('role_assigned')).toBeInTheDocument()
    expect(screen.getByText('192.168.1.50')).toBeInTheDocument()
  })

  it('opens side-by-side diff drawer on row click', async () => {
    renderPage(<AuditLogViewerPage />)

    const rowButton = await screen.findByRole('button', {
      name: /View audit log details for role_assigned on user/i,
    })
    fireEvent.click(rowButton)

    expect(await screen.findByText('Audit Event Details')).toBeInTheDocument()
    expect(screen.getByText('Field Changes')).toBeInTheDocument()
    expect(screen.getByText('Modified')).toBeInTheDocument()
  })

  it('triggers CSV export when Export Audit CSV button is clicked', async () => {
    const exportSpy = vi.spyOn(exportModule, 'exportAuditCsv').mockImplementation(() => {})
    renderPage(<AuditLogViewerPage />)

    const exportBtn = await screen.findByRole('button', { name: /Export Audit CSV/i })
    fireEvent.click(exportBtn)

    await waitFor(() => {
      expect(exportSpy).toHaveBeenCalledWith([mockItem])
    })
  })

  it('renders empty state when no items return', async () => {
    vi.mocked(auditService.list).mockResolvedValueOnce({
      items: [],
      total: 0,
    })

    renderPage(<AuditLogViewerPage />)

    expect(await screen.findByText('No audit events found')).toBeInTheDocument()
  })
})
