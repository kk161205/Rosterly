import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuditLogViewerPage } from '@/features/audit/pages/AuditLogViewerPage'
import { auditService } from '@/features/audit/services/auditService'
import { exportAuditCsv } from '@/features/audit/lib/exportAuditCsv'
import { downloadCsv, toCsv } from '@/lib/csv'
import { mockUser, renderPage } from '@/test/render'

vi.mock('@/features/auth/services/authService', () => ({
  authService: { getCurrentUser: vi.fn() },
}))

vi.mock('@/lib/csv', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/csv')>()), downloadCsv: vi.fn() }))

vi.mock('@/features/audit/services/auditService', () => ({
  auditService: {
    list: vi.fn(),
  },
}))

describe('Audit Log Viewer', () => {
  const mockItem = {
    id: 'aud-101',
    actor: {
      id: 'usr-1',
      full_name: 'Priya Patel',
      email: 'priya@rosterly.internal',
    },
    action: 'user.role_changed',
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

  it('lists events in plain words, with who, record and when', async () => {
    renderPage(<AuditLogViewerPage />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Audit log' })).toBeInTheDocument()
    const table = await screen.findByRole('table', { name: 'Audit log' })
    expect(within(table).getByText('Role changed')).toBeInTheDocument()
    expect(within(table).getByText('Priya Patel')).toBeInTheDocument()
    expect(within(table).getByText('Person')).toBeInTheDocument()
    expect(within(table).queryByText('user.role_changed')).not.toBeInTheDocument()
  })

  it('filters by a real action code and a period', async () => {
    renderPage(<AuditLogViewerPage />)
    fireEvent.change(await screen.findByLabelText('What happened'), { target: { value: 'request.approved' } })
    await waitFor(() => expect(auditService.list).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'request.approved', page: 1 })))
    fireEvent.change(screen.getByLabelText('When'), { target: { value: '7' } })
    await waitFor(() => expect(auditService.list).toHaveBeenLastCalledWith(expect.objectContaining({ from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) })))
  })

  it('shows what changed, before and after, in the side panel', async () => {
    renderPage(<AuditLogViewerPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Role changed — open details' }))
    const panel = await screen.findByRole('dialog', { name: 'Role changed' })
    expect(within(panel).getByText('What changed')).toBeInTheDocument()
    expect(within(panel).getByText('employee')).toBeInTheDocument()
    expect(within(panel).getByText('manager')).toBeInTheDocument()
    expect(within(panel).getByText('user.role_changed')).toBeInTheDocument() // the code is still there for auditors
  })

  it('downloads every matching event with the current filters, not just this page', async () => {
    renderPage(<AuditLogViewerPage />)
    fireEvent.change(await screen.findByLabelText('What happened'), { target: { value: 'user.role_changed' } })
    fireEvent.click(await screen.findByRole('button', { name: /Download CSV/ }))
    await waitFor(() => expect(downloadCsv).toHaveBeenCalled())
    expect(auditService.list).toHaveBeenLastCalledWith({ action: 'user.role_changed', from: undefined, page: 1, page_size: 100 })
  })

  it('says when nothing is recorded yet', async () => {
    vi.mocked(auditService.list).mockResolvedValue({ items: [], total: 0 })
    renderPage(<AuditLogViewerPage />)
    expect(await screen.findByText('Nothing recorded')).toBeInTheDocument()
  })
})

describe('Audit CSV export', () => {
  it('pages through the API and keeps raw codes next to the plain words', async () => {
    vi.clearAllMocks()
    const item = { id: 'e', actor: null, action: 'asset.assigned', entity_type: 'asset', entity_id: 'a1', before_state: null, after_state: null, ip_address: '1.1.1.1', created_at: 'x' }
    vi.mocked(auditService.list)
      .mockResolvedValueOnce({ items: Array.from({ length: 100 }, () => item), total: 150 })
      .mockResolvedValueOnce({ items: Array.from({ length: 50 }, () => item), total: 150 })
    await exportAuditCsv({ action: 'asset.assigned' })
    expect(auditService.list).toHaveBeenCalledTimes(2)
    expect(auditService.list).toHaveBeenLastCalledWith({ action: 'asset.assigned', page: 2, page_size: 100 })
    const [, header, rows] = vi.mocked(downloadCsv).mock.calls[0]
    expect(header).toContain('Action code')
    expect(rows).toHaveLength(150)
    expect(rows[0].slice(1, 3)).toEqual(['Asset assigned', 'asset.assigned'])
  })
})

describe('CSV cells', () => {
  it('quotes commas and neutralises spreadsheet formulas', () => {
    expect(toCsv(['a', 'b'], [['=SUM(A1)', 'x, y']])).toBe(`a,b\n'=SUM(A1),"x, y"`)
  })
})
