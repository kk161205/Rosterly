import React, { useEffect, useState } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import * as Menu from '@radix-ui/react-dropdown-menu'
import { MoreHorizontal, UserPlus } from 'lucide-react'
import { RolesDialog } from '@/features/admin/components/RolesDialog'
import { userManagementService } from '@/features/admin/services/userManagementService'
import type { ManagedUser } from '@/features/admin/types/users'
import { employeeService } from '@/features/employees/services/employeeService'
import { roleLabel, useCurrentUser } from '@/features/auth/hooks/useCurrentUser'
import { useSearchParamText, useUrlFilters } from '@/lib/useUrlFilters'
import { getErrorMessage, getFieldErrors } from '@/lib/errors'
import { formatAge } from '@/lib/format'
import {
  Alert,
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  SearchInput,
  SelectField,
  Skeleton,
  Status,
  Table,
  Td,
  TextField,
  Th,
  THead,
  Tr,
  cn,
} from '@/ui'

const PAGE_SIZE = 25
const USERS_KEY = ['admin', 'users'] as const
type Action = { kind: 'role' | 'status' | 'logout'; user: ManagedUser }
type ConfirmAction = { kind: 'status' | 'logout'; user: ManagedUser }

/** Primary role, then any additional roles (§5.14 multi-role). */
const RolesCell: React.FC<{ user: ManagedUser }> = ({ user }) => (
  <span className="flex flex-col gap-0.5">
    <span className="text-ink">{roleLabel(user.role_name)}</span>
    {user.additional_roles.length > 0 && (
      <span className="text-meta text-muted">+ {user.additional_roles.map((r) => roleLabel(r.name)).join(', ')}</span>
    )}
  </span>
)

/**
 * Users (§5.14): accounts, their roles and status. Invite creates the account
 * and sends a set-password link; row actions each confirm first.
 */
export const UserManagementPage: React.FC = () => {
  const { user: me, can } = useCurrentUser()
  const queryClient = useQueryClient()
  const { params, update } = useUrlFilters()
  const [searchText, setSearchText] = useSearchParamText(params, update)
  const search = params.get('search') ?? ''
  const roleId = params.get('role') ?? ''
  const status = params.get('status') ?? ''
  const page = Number(params.get('page') ?? '1')
  const [inviting, setInviting] = useState(false)
  const [action, setAction] = useState<Action | null>(null)


  const query = { search: search || undefined, role_id: roleId || undefined, status: status || undefined, page, page_size: PAGE_SIZE }
  const list = useQuery({ queryKey: [...USERS_KEY, query], queryFn: () => userManagementService.list(query), placeholderData: keepPreviousData })
  const roles = useQuery({ queryKey: ['assignable-roles'], queryFn: userManagementService.assignableRoles })
  const items = list.data?.items ?? []

  const canInvite = can('user:create')
  const canRole = can('user:assign_role')
  const canStatus = can('user:update')
  const canLogout = can('user:force_logout')
  const hasActions = canRole || canStatus || canLogout

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Users"
        description="Who can sign in, with which roles, and when they were last active."
        actions={
          canInvite && (
            <Button variant="primary" onClick={() => setInviting(true)}>
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Invite someone
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <SearchInput label="Search users" placeholder="Search name, email or code" value={searchText} onChange={setSearchText} className="sm:w-72" />
        <SelectField
          label="Role"
          hideLabel
          className="sm:w-48"
          options={[{ value: '', label: 'Any role' }, ...(roles.data ?? []).map((r) => ({ value: r.id, label: roleLabel(r.name) }))]}
          value={roleId}
          onChange={(e) => update({ role: e.target.value })}
        />
        <SelectField
          label="Status"
          hideLabel
          className="sm:w-44"
          options={[
            { value: '', label: 'Any status' },
            ...['active', 'inactive', 'onboarding', 'offboarding', 'terminated'].map((s) => ({ value: s, label: roleLabel(s) })),
          ]}
          value={status}
          onChange={(e) => update({ status: e.target.value })}
        />
      </div>

      {list.isLoading ? (
        <div className="flex flex-col gap-4" aria-label="Loading users">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : list.isError ? (
        <ErrorState message={getErrorMessage(list.error, 'Users could not be loaded.')} onRetry={() => list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title="No users match" description="Try a different name, role or status." />
      ) : (
        <div className={cn(list.isFetching && 'opacity-70 transition-opacity')}>
          <Table label="Users" className="hidden md:block">
            <THead>
              <Th>Person</Th>
              <Th>Roles</Th>
              <Th>Status</Th>
              <Th>Last active</Th>
              {hasActions && <Th srOnly>Actions</Th>}
            </THead>
            <tbody>
              {items.map((u) => (
                <Tr key={u.id}>
                  <Td>
                    <span className="flex flex-col gap-0.5">
                      <span className="font-medium text-ink">{u.full_name}</span>
                      <span className="text-meta text-muted">{u.email}</span>
                    </span>
                  </Td>
                  <Td>
                    <RolesCell user={u} />
                  </Td>
                  <Td>
                    <Status value={u.status} />
                  </Td>
                  <Td className="whitespace-nowrap text-muted">
                    {u.last_login_at ? `${formatAge(u.last_login_at)} ago` : u.status === 'inactive' && !u.last_login_at ? 'Invited, not signed in' : 'Never'}
                  </Td>
                  {hasActions && (
                    <Td className="w-12 text-right">
                      {u.id !== me?.id && (
                        <RowMenu user={u} canRole={canRole} canStatus={canStatus} canLogout={canLogout} onAction={setAction} />
                      )}
                    </Td>
                  )}
                </Tr>
              ))}
            </tbody>
          </Table>
          <ul className="m-0 list-none border-t border-ink p-0 md:hidden" aria-label="Users">
            {items.map((u) => (
              <li key={u.id} className="flex items-start justify-between gap-3 border-b border-line-soft py-3">
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="truncate text-body font-medium text-ink">{u.full_name}</span>
                  <span className="flex flex-wrap items-center gap-x-3 text-meta text-muted">
                    {[u.role_name, ...u.additional_roles.map((r) => r.name)].map(roleLabel).join(' + ')}
                    <Status value={u.status} />
                  </span>
                </span>
                {hasActions && u.id !== me?.id && (
                  <RowMenu user={u} canRole={canRole} canStatus={canStatus} canLogout={canLogout} onAction={setAction} />
                )}
              </li>
            ))}
          </ul>
          <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onPage={(p) => update({ page: String(p) })} />
        </div>
      )}

      <InviteDialog open={inviting} onOpenChange={setInviting} />
      {action?.kind === 'role' ? (
        <RolesDialog
          user={action.user}
          onClose={() => setAction(null)}
          onSaved={() => void queryClient.invalidateQueries({ queryKey: USERS_KEY })}
        />
      ) : (
        <ActionDialog action={action as ConfirmAction | null} onClose={() => setAction(null)} />
      )}
    </div>
  )
}

const RowMenu: React.FC<{
  user: ManagedUser
  canRole: boolean
  canStatus: boolean
  canLogout: boolean
  onAction: (a: Action) => void
}> = ({ user, canRole, canStatus, canLogout, onAction }) => {
  const item = 'flex min-h-9 cursor-pointer select-none items-center rounded-soft px-3 text-body outline-none data-[highlighted]:bg-row-hover'
  const deactivating = user.status !== 'inactive'
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={`Actions for ${user.full_name}`}
        className="inline-flex h-9 w-9 items-center justify-center rounded-pill text-muted transition-colors hover:bg-row-hover hover:text-ink data-[state=open]:bg-row-hover"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={4} className="z-50 min-w-52 rounded-card border border-line bg-paper p-1.5">
          {canRole && (
            <Menu.Item className={cn(item, 'text-ink')} onSelect={() => onAction({ kind: 'role', user })}>
              Change roles
            </Menu.Item>
          )}
          {canLogout && (
            <Menu.Item className={cn(item, 'text-ink')} onSelect={() => onAction({ kind: 'logout', user })}>
              Sign out of all devices
            </Menu.Item>
          )}
          {canStatus && user.status !== 'terminated' && (
            <>
              <Menu.Separator className="my-1.5 h-px bg-line" />
              <Menu.Item className={cn(item, deactivating ? 'text-status-bad' : 'text-ink')} onSelect={() => onAction({ kind: 'status', user })}>
                {deactivating ? 'Deactivate' : 'Reactivate'}
              </Menu.Item>
            </>
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}

const ActionDialog: React.FC<{ action: ConfirmAction | null; onClose: () => void }> = ({ action, onClose }) => {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (action) setError(null)
  }, [action])

  if (!action) return null
  const { user, kind } = action
  const first = user.full_name.split(' ')[0]
  const deactivating = user.status !== 'inactive'
  const copy = {
    logout: { title: `Sign ${first} out everywhere?`, body: 'Every session ends now. They can sign in again straight away.', confirm: 'Sign out everywhere', danger: false },
    status: deactivating
      ? { title: `Deactivate ${first}?`, body: `${first} is signed out and can't sign in until reactivated.`, confirm: 'Deactivate', danger: true }
      : { title: `Reactivate ${first}?`, body: `${first} can sign in again.`, confirm: 'Reactivate', danger: false },
  }[kind]

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      if (kind === 'logout') await userManagementService.forceLogout(user.id)
      if (kind === 'status') await userManagementService.setStatus(user.id, deactivating ? 'inactive' : 'active')
      await queryClient.invalidateQueries({ queryKey: USERS_KEY })
      onClose()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      busy={busy}
      title={copy.title}
      description={user.email}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={copy.danger ? 'danger' : 'primary'} isLoading={busy} onClick={run}>
            {copy.confirm}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}
        <p className="text-body text-muted">{copy.body}</p>
      </div>
    </Dialog>
  )
}

const InviteDialog: React.FC<{ open: boolean; onOpenChange: (o: boolean) => void }> = ({ open, onOpenChange }) => {
  const queryClient = useQueryClient()
  const roles = useQuery({ queryKey: ['assignable-roles'], queryFn: userManagementService.assignableRoles, enabled: open })
  const departments = useQuery({ queryKey: ['departments'], queryFn: employeeService.getDepartments, enabled: open })
  const [form, setForm] = useState({ full_name: '', email: '', role_id: '', department_id: '', designation: '', date_of_joining: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setForm({ full_name: '', email: '', role_id: '', department_id: '', designation: '', date_of_joining: '' })
    setErrors({})
    setError(null)
    setSent(null)
  }, [open])
  useEffect(() => {
    // Default to the plain employee role once roles load
    if (open && !form.role_id && roles.data) {
      const employee = roles.data.find((r) => r.name === 'employee')
      if (employee) setForm((f) => ({ ...f, role_id: employee.id }))
    }
  }, [open, roles.data]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async () => {
    const v: Record<string, string> = {}
    if (!form.full_name.trim()) v.full_name = 'Enter their name.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) v.email = 'Enter a valid work email.'
    if (!form.role_id) v.role_id = 'Choose a role.'
    setErrors(v)
    if (Object.keys(v).length) return
    setBusy(true)
    setError(null)
    try {
      const created = await userManagementService.invite({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        role_id: form.role_id,
        ...(form.department_id ? { department_id: form.department_id } : {}),
        ...(form.designation.trim() ? { designation: form.designation.trim() } : {}),
        ...(form.date_of_joining ? { date_of_joining: form.date_of_joining } : {}),
      })
      await queryClient.invalidateQueries({ queryKey: USERS_KEY })
      await queryClient.invalidateQueries({ queryKey: ['employees'] })
      setSent(`${created.full_name} (${created.employee_code}) was added.`)
    } catch (err) {
      setError(getErrorMessage(err))
      setErrors(getFieldErrors(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Invite someone"
      description="Creates their account and a set-password link that works for 72 hours."
      className="max-w-xl"
      footer={
        sent ? (
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" isLoading={busy} onClick={submit}>
              Send invite
            </Button>
          </>
        )
      }
    >
      {sent ? (
        <div className="flex flex-col gap-3">
          <Alert tone="success">{sent}</Alert>
          <p className="text-body text-muted">
            The account stays inactive until they set a password from the invite email. Invite emails go out once email delivery is switched
            on for this workspace. Start their onboarding from People → Onboarding.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {error && <Alert>{error}</Alert>}
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField label="Full name" value={form.full_name} onChange={set('full_name')} error={errors.full_name} />
            <TextField label="Work email" type="email" value={form.email} onChange={set('email')} error={errors.email} />
            <SelectField
              label="Role"
              hint="Add more roles from Users once they’ve joined."
              options={(roles.data ?? []).map((r) => ({ value: r.id, label: roleLabel(r.name) }))}
              value={form.role_id}
              onChange={set('role_id')}
              error={errors.role_id}
            />
            <SelectField
              label="Department"
              options={[{ value: '', label: 'Not yet' }, ...(departments.data ?? []).map((d) => ({ value: d.id, label: d.name }))]}
              value={form.department_id}
              onChange={set('department_id')}
              error={errors.department_id}
            />
            <TextField label="Job title" value={form.designation} onChange={set('designation')} error={errors.designation} />
            <TextField label="Joining date" type="date" value={form.date_of_joining} onChange={set('date_of_joining')} error={errors.date_of_joining} />
          </div>
        </div>
      )}
    </Dialog>
  )
}

