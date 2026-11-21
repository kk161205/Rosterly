import React, { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { roleManagementService } from '@/features/admin/services/roleManagementService'
import type { Permission, Role } from '@/features/admin/types/roles'
import { actionLabel, resourceLabel } from '@/features/admin/lib/permissionLabels'
import { CURRENT_USER_KEY, roleLabel, useCurrentUser } from '@/features/auth/hooks/useCurrentUser'
import { getErrorMessage } from '@/lib/errors'
import { Alert, Button, EmptyState, ErrorState, PageHeader, SelectField, Skeleton, cn } from '@/ui'

// Primary-only roles never sit alongside another role, so they need no conflict entries
const PRIMARY_ONLY = ['super_admin', 'employee']

/**
 * Roles: the six roles are fixed. This page explains what each one can
 * do (read-only) and which roles one person may not hold together.
 */
export const RoleManagementPage: React.FC = () => {
  const queryClient = useQueryClient()
  const roles = useQuery({ queryKey: ['admin', 'roles'], queryFn: roleManagementService.roles })
  const [roleId, setRoleId] = useState<string | null>(null)

  useEffect(() => {
    if (!roleId && roles.data?.length) setRoleId(roles.data[0].id)
  }, [roles.data, roleId])

  const role = roles.data?.find((r) => r.id === roleId) ?? null

  if (roles.isLoading)
    return (
      <div className="flex flex-col gap-4" aria-label="Loading roles">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  if (roles.isError)
    return <ErrorState message={getErrorMessage(roles.error, 'Roles could not be loaded.')} onRetry={() => roles.refetch()} />

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Roles" description="What each role can see and do. Give people roles from Users or their profile." />

      {/* Phones: a role picker instead of the side list */}
      <SelectField data-guide="roles.pick"
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
                  <span className="truncate text-body font-medium text-ink">{roleLabel(r.name)}</span>
                  <span className="shrink-0 text-meta tabular-nums text-muted">{r.user_count}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {role ? (
          <RoleDetail
            key={role.id}
            role={role}
            roles={roles.data ?? []}
            onSaved={() => {
              void queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] })
              void queryClient.invalidateQueries({ queryKey: CURRENT_USER_KEY })
            }}
          />
        ) : (
          <EmptyState title="No roles found" />
        )}
      </div>
    </div>
  )
}

const RoleDetail: React.FC<{ role: Role; roles: Role[]; onSaved: () => void }> = ({ role, roles, onSaved }) => {
  const current = useQuery({ queryKey: ['admin', 'roles', role.id, 'permissions'], queryFn: () => roleManagementService.rolePermissions(role.id) })

  const byArea = useMemo(() => {
    const map = new Map<string, Permission[]>()
    for (const p of current.data?.permissions ?? []) map.set(p.resource, [...(map.get(p.resource) ?? []), p])
    return [...map.entries()].sort(([a], [b]) => resourceLabel(a).localeCompare(resourceLabel(b)))
  }, [current.data])

  return (
    <section aria-labelledby="role-heading" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="role-heading" className="font-display text-panel text-ink">
          {roleLabel(role.name)}
        </h2>
        <p className="text-body text-muted">{role.description}</p>
        <p className="text-meta text-muted">
          {role.user_count} {role.user_count === 1 ? 'person holds' : 'people hold'} it
        </p>
      </div>

      <h3 className="text-section text-ink">What they can do</h3>
      {current.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : current.isError ? (
        <ErrorState message={getErrorMessage(current.error)} onRetry={() => current.refetch()} />
      ) : byArea.length === 0 ? (
        <p className="text-body text-muted">Only what everyone can do with their own records.</p>
      ) : (
        <dl className="m-0 border-t border-ink">
          {byArea.map(([resource, perms]) => (
            <div key={resource} className="grid gap-x-6 gap-y-1 border-b border-line-soft py-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
              <dt className="text-body font-medium text-ink">{resourceLabel(resource)}</dt>
              <dd className="m-0 text-body text-muted">
                {perms
                  .map((p) => actionLabel(p.action))
                  .sort((a, b) => a.localeCompare(b))
                  .join(', ')}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {!PRIMARY_ONLY.includes(role.name) && <Conflicts key={role.id} role={role} roles={roles} onSaved={onSaved} />}
    </section>
  )
}

/** Roles one person may not hold together with this one, e.g. Auditor and IT admin. Read-only without role:update. */
const Conflicts: React.FC<{ role: Role; roles: Role[]; onSaved: () => void }> = ({ role, roles, onSaved }) => {
  const editable = useCurrentUser().can('role:update')
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
              className="h-4 w-4 accent-navy disabled:opacity-60"
              checked={picked.has(r.id)}
              disabled={!editable}
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
      {editable && (
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
      )}
    </section>
  )
}
