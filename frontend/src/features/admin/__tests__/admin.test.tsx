import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserManagementPage } from '@/features/admin/pages/UserManagementPage'
import { RoleManagementPage } from '@/features/admin/pages/RoleManagementPage'
import { userManagementService } from '@/features/admin/services/userManagementService'
import { roleManagementService } from '@/features/admin/services/roleManagementService'
import { mockUser, renderPage } from '@/test/render'

vi.mock('@/features/auth/services/authService', () => ({ authService: { getCurrentUser: vi.fn() } }))
vi.mock('@/features/admin/services/userManagementService', () => ({
  userManagementService: {
    list: vi.fn(),
    assignableRoles: vi.fn(),
    invite: vi.fn(),
    setRoles: vi.fn(),
    accessPreview: vi.fn(),
    setStatus: vi.fn(),
    forceLogout: vi.fn(),
  },
}))
vi.mock('@/features/admin/services/roleManagementService', () => ({
  roleManagementService: {
    roles: vi.fn(),
    permissions: vi.fn(),
    rolePermissions: vi.fn(),
    savePermissions: vi.fn(),
    saveConflicts: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
  },
}))
vi.mock('@/features/employees/services/employeeService', () => ({ employeeService: { getDepartments: vi.fn().mockResolvedValue([]) } }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(userManagementService.assignableRoles).mockResolvedValue([
    { id: 'r-emp', name: 'employee', description: null, is_system_role: true },
    { id: 'r-mgr', name: 'manager', description: 'Approves their team', is_system_role: true },
    { id: 'r-it', name: 'it_admin', description: null, is_system_role: true },
    { id: 'r-aud', name: 'auditor', description: null, is_system_role: true },
    { id: 'r-sa', name: 'super_admin', description: null, is_system_role: true },
  ])
  vi.mocked(userManagementService.accessPreview).mockImplementation(async (ids: string[]) => ({
    permissions: [
      { permission: 'request:create', description: null, roles: ids.includes('r-mgr') ? ['employee', 'manager'] : ['employee'] },
      ...(ids.includes('r-mgr') ? [{ permission: 'request:approve', description: null, roles: ['manager'] }] : []),
    ],
    conflicts: [],
  }))
  vi.mocked(userManagementService.list).mockResolvedValue({
    items: [
      {
        id: 'u1', employee_code: 'RST-0007', full_name: 'Aman Gupta', email: 'aman@example.com', role_id: 'r-emp', role_name: 'employee',
        additional_roles: [{ id: 'r-it', name: 'it_admin' }], department_id: null, department_name: null, designation: 'Designer', status: 'active', last_login_at: null, created_at: null,
      },
    ],
    total: 1,
    page: 1,
    page_size: 25,
  })
  vi.mocked(roleManagementService.roles).mockResolvedValue([
    { id: 'r-emp', name: 'employee', description: 'Everyone', is_system_role: true, user_count: 12, conflicts_with: [], created_at: null },
    { id: 'r-fac', name: 'facilities', description: null, is_system_role: false, user_count: 0, conflicts_with: [], created_at: null },
    { id: 'r-it', name: 'it_admin', description: null, is_system_role: true, user_count: 2, conflicts_with: [{ id: 'r-aud', name: 'auditor' }], created_at: null },
    { id: 'r-aud', name: 'auditor', description: null, is_system_role: true, user_count: 1, conflicts_with: [{ id: 'r-it', name: 'it_admin' }], created_at: null },
  ])
  vi.mocked(roleManagementService.permissions).mockResolvedValue([
    { id: 'p1', resource: 'request', action: 'create', description: null },
    { id: 'p2', resource: 'request', action: 'approve', description: null },
  ])
  vi.mocked(roleManagementService.rolePermissions).mockResolvedValue({ role_id: 'r-emp', role_name: 'employee', permissions: [{ id: 'p1', resource: 'request', action: 'create', description: null }] })
})

describe('Users (§5.14)', () => {
  it('shows extra roles next to the primary role', async () => {
    mockUser('super_admin', ['user:read'])
    renderPage(<UserManagementPage />)
    const table = await screen.findByRole('table', { name: 'Users' })
    expect(within(table).getByText('+ IT admin')).toBeInTheDocument()
  })

  it('sets a primary and additional roles, previewing the merged access', async () => {
    mockUser('super_admin', ['user:read', 'user:assign_role', 'role:read'])
    vi.mocked(userManagementService.setRoles).mockResolvedValue({} as never)
    renderPage(<UserManagementPage />)
    const table = await screen.findByRole('table', { name: 'Users' })
    fireEvent.keyDown(within(table).getByRole('button', { name: 'Actions for Aman Gupta' }), { key: 'Enter' })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Change roles' }))
    const dialog = await screen.findByRole('dialog', { name: 'Aman’s roles' })

    // Primary-only roles are never offered as extras; Auditor clashes with the IT admin role already held
    expect(within(dialog).queryByRole('checkbox', { name: /Super admin/ })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('checkbox', { name: /^Employee/ })).not.toBeInTheDocument()
    expect(await within(dialog).findByText('Can’t be combined with IT admin.')).toBeInTheDocument()
    expect(within(dialog).getByRole('checkbox', { name: /Auditor/ })).toBeDisabled()

    const save = within(dialog).getByRole('button', { name: 'Save roles' })
    expect(save).toBeDisabled()
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Manager/ }))
    expect(await within(dialog).findByText('Approve')).toBeInTheDocument()
    expect(within(dialog).getByText('Employee, Manager')).toBeInTheDocument() // which roles grant it
    fireEvent.click(save)
    await waitFor(() => expect(userManagementService.setRoles).toHaveBeenCalledWith('u1', 'r-emp', ['r-it', 'r-mgr']))
  })

  it('hides role changes from HR admins (super admin only)', async () => {
    mockUser('hr_admin', ['user:read', 'user:create', 'user:update'])
    renderPage(<UserManagementPage />)
    const table = await screen.findByRole('table', { name: 'Users' })
    fireEvent.keyDown(within(table).getByRole('button', { name: 'Actions for Aman Gupta' }), { key: 'Enter' })
    expect(await screen.findByRole('menuitem', { name: 'Deactivate' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Change roles' })).not.toBeInTheDocument()
  })

  it('validates the invite form before sending', async () => {
    mockUser('hr_admin', ['user:read', 'user:create'])
    renderPage(<UserManagementPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Invite someone/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Invite someone' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send invite' }))
    expect(await within(dialog).findByText('Enter their name.')).toBeInTheDocument()
    expect(userManagementService.invite).not.toHaveBeenCalled()
  })
})

describe('Roles (§5.13)', () => {
  it('shows the matrix for a role and saves the full set', async () => {
    mockUser('super_admin', ['role:read', 'role:update'])
    vi.mocked(roleManagementService.savePermissions).mockResolvedValue({ role_id: 'r-emp', role_name: 'employee', permissions: [] })
    renderPage(<RoleManagementPage />)
    const approve = await screen.findByRole('checkbox', { name: 'Approve' })
    expect(screen.getByRole('checkbox', { name: 'Create' })).toBeChecked()
    expect(approve).not.toBeChecked()
    fireEvent.click(approve)
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(roleManagementService.savePermissions).toHaveBeenCalledWith('r-emp', ['p1', 'p2']))
  })

  it('saves which roles can’t be held together', async () => {
    mockUser('super_admin', ['role:read', 'role:update'])
    vi.mocked(roleManagementService.saveConflicts).mockResolvedValue([])
    renderPage(<RoleManagementPage />)
    fireEvent.click((await screen.findAllByRole('button', { name: /IT admin/ }))[0])
    const section = await screen.findByRole('region', { name: 'Can’t be held together with' })
    expect(within(section).getByRole('checkbox', { name: 'Auditor' })).toBeChecked()
    fireEvent.click(within(section).getByRole('checkbox', { name: 'Facilities' }))
    fireEvent.click(within(section).getByRole('button', { name: 'Save combinations' }))
    await waitFor(() => expect(roleManagementService.saveConflicts).toHaveBeenCalledWith('r-it', ['r-aud', 'r-fac']))
  })

  it('only offers delete for custom roles', async () => {
    mockUser('super_admin', ['role:read'])
    renderPage(<RoleManagementPage />)
    await screen.findByRole('heading', { level: 2, name: 'Employee' })
    expect(screen.queryByRole('button', { name: 'Delete role' })).not.toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: /Facilities/ })[0])
    expect(await screen.findByRole('button', { name: 'Delete role' })).toBeInTheDocument()
  })
})
