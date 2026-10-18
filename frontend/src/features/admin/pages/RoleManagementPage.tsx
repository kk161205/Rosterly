import React, { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, Plus } from 'lucide-react'
import { roleManagementService } from '@/features/admin/services/roleManagementService'
import type { Permission, Role } from '@/features/admin/types/roles'
import { actionLabel, resourceLabel } from '@/features/admin/lib/permissionLabels'
import { CURRENT_USER_KEY, roleLabel } from '@/features/auth/hooks/useCurrentUser'
import { getErrorMessage, getFieldErrors } from '@/lib/errors'
import { Alert, Button, Dialog, EmptyState, ErrorState, PageHeader, SelectField, Skeleton, TextField, cn } from '@/ui'

// Primary-only roles (§5.14) never sit alongside another role, so they need no conflict entries
const PRIMARY_ONLY = ['super_admin', 'employee']

/**
 * Roles (§5.13): pick a role, tick what it may do, save. Changes apply to
 * everyone holding the role on their next request — sessions re-check live.
 * Below the permissions: the roles it can't be combined with (§5.14).
 */
export const RoleManagementPage: React.FC = () => {
  const queryClient = useQueryClient()
  const roles = useQuery({ queryKey: ['admin', 'roles'], queryFn: roleManagementService.roles })
  const permissions = useQuery({ queryKey: ['admin', 'permissions'], queryFn: roleManagementService.permissions })
  const [roleId, setRoleId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!roleId && roles.data?.length) setRoleId(roles.data[0].id)
  }, [roles.data, roleId])

  const role = roles.data?.find((r) => r.id === roleId) ?? null

  if (roles.isLoading || permissions.isLoading)
    return (
      <div className="flex flex-col gap-4" aria-label="Loading roles">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  if (roles.isError || permissions.isError)
    return <ErrorState message={getErrorMessage(roles.error ?? permissions.error, 'Roles could not be loaded.')} onRetry={() => { roles.refetch(); permissions.refetch() }} />

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Roles"
        description="What each role can see and do. Changes reach everyone with the role on their next click."
        actions={
          <Button variant="secondary" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New role
          </Button>
        }
      />

      {/* Phones: a role picker instead of the side list */}
      <SelectField
        label="Role"
        className="lg:hidden"
        options={(roles.data ?? []).map((r) => ({ value: r.id, label: `${roleLabel(r.name)} · ${r.user_count} ${r.user_count === 1 ? 'person' : 'people'}` }))}
        value={roleId ?? ''}
        onChange={(e) => setRoleId(e.target.value)}
      />

      <div className="grid gap-10 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <nav aria-label="Roles" className="hidden lg:block">
          <ul className="m-0 flex list-none flex-col gap-0.5 border-t border-ink p-0 pt-2">
            {(roles.data ?? []).map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  aria-current={r.id === roleId ? 'true' : undefined}
                  onClick={() => setRoleId(r.id)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-card px-3 py-2.5 text-left transition-colors',
                    r.id === roleId ? 'bg-row-selected' : 'hover:bg-row-hover',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-body font-medium text-ink">{roleLabel(r.name)}</span>
                    {r.is_system_role && (
                      <span title="Built-in role — it can't be deleted">
                        <Lock className="h-3.5 w-3.5 shrink-0 text-muted" aria-label="Built-in role" />
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-meta tabular-nums text-muted">{r.user_count}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {role ? (
          <Matrix
            key={role.id}
            role={role}
            roles={roles.data ?? []}
            all={permissions.data ?? []}
            onDelete={() => setDeleting(true)}
            onSaved={() => {
              void queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] })
              void queryClient.invalidateQueries({ queryKey: ['assignable-roles'] })
              void queryClient.invalidateQueries({ queryKey: CURRENT_USER_KEY })
            }}
          />
        ) : (
          <EmptyState title="No roles yet" />
        )}
      </div>

      <NewRoleDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(r) => {
          void queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] })
          void queryClient.invalidateQueries({ queryKey: ['assignable-roles'] })
          setRoleId(r.id)
        }}
      />
      {role && (
        <DeleteRoleDialog
          role={role}
          open={deleting}
          onOpenChange={setDeleting}
          onDeleted={() => {
            setRoleId(null)
            void queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] })
            void queryClient.invalidateQueries({ queryKey: ['assignable-roles'] })
          }}
        />
      )}
    </div>
  )
}

const Matrix: React.FC<{ role: Role; roles: Role[]; all: Permission[]; onSaved: () => void; onDelete: () => void }> = ({
  role,
  roles,
  all,
  onSaved,
  onDelete,
}) => {
  const current = useQuery({ queryKey: ['admin', 'roles', role.id, 'permissions'], queryFn: () => roleManagementService.rolePermissions(role.id) })
  const [granted, setGranted] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const original = useMemo(() => new Set((current.data?.permissions ?? []).map((p) => p.id)), [current.data])
  useEffect(() => setGranted(new Set(original)), [original])

  const byResource = useMemo(() => {
    const map = new Map<string, Permission[]>()
    for (const p of all) map.set(p.resource, [...(map.get(p.resource) ?? []), p])
    return [...map.entries()].sort(([a], [b]) => resourceLabel(a).localeCompare(resourceLabel(b)))
  }, [all])

  const dirty = granted.size !== original.size || [...granted].some((id) => !original.has(id))
  const toggle = (id: string, on: boolean) => {
    setSaved(false)
    setGranted((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await roleManagementService.savePermissions(role.id, [...granted])
      await current.refetch()
      setSaved(true)
      onSaved()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="matrix-heading" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="matrix-heading" className="font-display text-panel text-ink">
            {roleLabel(role.name)}
          </h2>
          <p className="text-body text-muted">
            {role.description || 'No description.'} · {role.user_count} {role.user_count === 1 ? 'person holds' : 'people hold'} it
          </p>
        </div>
        {!role.is_system_role && (
          <Button variant="danger" size="sm" onClick={onDelete}>
            Delete role
          </Button>
        )}
      </div>
      {error && <Alert>{error}</Alert>}
      {current.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : current.isError ? (
        <ErrorState message={getErrorMessage(current.error)} onRetry={() => current.refetch()} />
      ) : (
        <div className="border-t border-ink">
          {byResource.map(([resource, perms]) => (
            <fieldset key={resource} className="m-0 grid gap-x-6 gap-y-2 border-0 border-b border-line-soft p-0 py-3.5 sm:grid-cols-[12rem_minmax(0,1fr)]">
              <legend className="float-left text-body font-medium text-ink">{resourceLabel(resource)}</legend>
              <div className="flex flex-wrap gap-x-6 gap-y-2.5 sm:col-start-2">
                {perms
                  .slice()
                  .sort((a, b) => a.action.localeCompare(b.action))
                  .map((p) => (
                    <label key={p.id} className="flex cursor-pointer items-center gap-2 text-body text-ink" title={p.description ?? undefined}>
                      <input type="checkbox" className="h-4 w-4 accent-navy" checked={granted.has(p.id)} onChange={(e) => toggle(p.id, e.target.checked)} />
                      {actionLabel(p.action)}
                    </label>
                  ))}
              </div>
            </fieldset>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={!dirty} isLoading={busy} onClick={save}>
          Save changes
        </Button>
        {dirty && (
          <Button variant="ghost" onClick={() => setGranted(new Set(original))} disabled={busy}>
            Undo changes
          </Button>
        )}
        <span className="text-meta text-muted" aria-live="polite">
          {saved && !dirty ? 'Saved. Applies to live sessions straight away.' : 'Applies to live sessions as soon as you save.'}
        </span>
      </div>
      {!PRIMARY_ONLY.includes(role.name) && <Conflicts key={role.id} role={role} roles={roles} onSaved={onSaved} />}
    </section>
  )
}

/** Roles one person may not hold together with this one (§5.14), e.g. Auditor and IT admin. */
const Conflicts: React.FC<{ role: Role; roles: Role[]; onSaved: () => void }> = ({ role, roles, onSaved }) => {
  const original = useMemo(() => new Set(role.conflicts_with.map((c) => c.id)), [role.conflicts_with])
  const [picked, setPicked] = useState<Set<string>>(original)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => setPicked(new Set(original)), [original])

  const options = roles.filter((r) => r.id !== role.id && !PRIMARY_ONLY.includes(r.name))
  const dirty = picked.size !== original.size || [...picked].some((id) => !original.has(id))

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      // Keep entries with primary-only roles: they aren't shown, but still stand
      const kept = role.conflicts_with.filter((c) => PRIMARY_ONLY.includes(c.name)).map((c) => c.id)
      await roleManagementService.saveConflicts(role.id, [...new Set([...picked, ...kept])])
      onSaved()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="conflicts-heading" className="mt-6 flex flex-col gap-3 border-t border-ink pt-4">
      <div className="flex flex-col gap-1">
        <h3 id="conflicts-heading" className="text-section text-ink">
          Can’t be held together with
        </h3>
        <p className="text-body text-muted">
          Nobody can hold {roleLabel(role.name)} alongside these roles — for example, whoever audits changes shouldn’t also make them.
        </p>
      </div>
      {error && <Alert>{error}</Alert>}
      <div className="flex flex-wrap gap-x-6 gap-y-2.5">
        {options.map((r) => (
          <label key={r.id} className="flex cursor-pointer items-center gap-2 text-body text-ink">
            <input
              type="checkbox"
              className="h-4 w-4 accent-navy"
              checked={picked.has(r.id)}
              onChange={(e) =>
                setPicked((prev) => {
                  const next = new Set(prev)
                  if (e.target.checked) next.add(r.id)
                  else next.delete(r.id)
                  return next
                })
              }
            />
            {roleLabel(r.name)}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" disabled={!dirty} isLoading={busy} onClick={save}>
          Save combinations
        </Button>
        {dirty && (
          <Button variant="ghost" onClick={() => setPicked(new Set(original))} disabled={busy}>
            Undo
          </Button>
        )}
      </div>
    </section>
  )
}

const NewRoleDialog: React.FC<{ open: boolean; onOpenChange: (o: boolean) => void; onCreated: (r: Role) => void }> = ({ open, onOpenChange, onCreated }) => {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) {
      setName('')
      setDescription('')
      setError(null)
      setErrors({})
    }
  }, [open])
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New role"
      description="It starts with no permissions; tick them after creating it."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            isLoading={busy}
            disabled={!name.trim()}
            onClick={async () => {
              setBusy(true)
              setError(null)
              try {
                const r = await roleManagementService.create(name.trim().toLowerCase().replace(/\s+/g, '_'), description.trim())
                onCreated(r)
                onOpenChange(false)
              } catch (err) {
                setError(getErrorMessage(err))
                setErrors(getFieldErrors(err))
              } finally {
                setBusy(false)
              }
            }}
          >
            Create role
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {error && <Alert>{error}</Alert>}
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} hint="e.g. Facilities" maxLength={50} />
        <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} error={errors.description} maxLength={500} />
      </div>
    </Dialog>
  )
}

const DeleteRoleDialog: React.FC<{ role: Role; open: boolean; onOpenChange: (o: boolean) => void; onDeleted: () => void }> = ({
  role,
  open,
  onOpenChange,
  onDeleted,
}) => {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      title={`Delete ${roleLabel(role.name)}?`}
      description={
        role.user_count > 0
          ? `${role.user_count} ${role.user_count === 1 ? 'person still holds' : 'people still hold'} this role, as their main or an extra role — change their roles first.`
          : 'This can’t be undone.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Keep it
          </Button>
          <Button
            variant="danger"
            isLoading={busy}
            disabled={role.user_count > 0}
            onClick={async () => {
              setBusy(true)
              setError(null)
              try {
                await roleManagementService.remove(role.id)
                onOpenChange(false)
                onDeleted()
              } catch (err) {
                setError(getErrorMessage(err))
              } finally {
                setBusy(false)
              }
            }}
          >
            Delete role
          </Button>
        </>
      }
    >
      {error ? <Alert>{error}</Alert> : <span />}
    </Dialog>
  )
}
