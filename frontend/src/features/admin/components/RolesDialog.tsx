import React, { useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { roleManagementService } from '@/features/admin/services/roleManagementService'
import { userManagementService } from '@/features/admin/services/userManagementService'
import { actionLabel, resourceLabel } from '@/features/admin/lib/permissionLabels'
import type { ManagedUser } from '@/features/admin/types/users'
import { roleLabel, rolesLabel } from '@/features/auth/hooks/useCurrentUser'
import { getErrorMessage } from '@/lib/errors'
import { Alert, Button, Dialog, SelectField, Skeleton, cn } from '@/ui'

// Primary-only (§5.14): super admin already holds everything; employee is everyone's baseline
const PRIMARY_ONLY = ['super_admin', 'employee']

/**
 * Roles for one person (§5.14 multi-role): a primary role — their title — plus
 * additional roles. Access is the union, previewed live from the server before
 * saving. Roles that can't be combined are disabled with the reason.
 */
export const RolesDialog: React.FC<{ user: ManagedUser; onClose: () => void; onSaved: () => void }> = ({ user, onClose, onSaved }) => {
  const assignable = useQuery({ queryKey: ['assignable-roles'], queryFn: userManagementService.assignableRoles })
  // Conflicts live on the roles list (role:read — super admin, who is also the only one who assigns roles)
  const roleList = useQuery({ queryKey: ['admin', 'roles'], queryFn: roleManagementService.roles })
  const [primary, setPrimary] = useState(user.role_id)
  const [extra, setExtra] = useState<Set<string>>(() => new Set(user.additional_roles.map((r) => r.id)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const roles = assignable.data ?? []
  const nameOf = (id: string) => roles.find((r) => r.id === id)?.name ?? ''
  const conflictsOf = (id: string) => roleList.data?.find((r) => r.id === id)?.conflicts_with ?? []
  const primaryName = nameOf(primary)
  const superPrimary = primaryName === 'super_admin'

  // A role promoted to primary stops being additional; a super admin takes none
  useEffect(() => {
    setExtra((prev) => {
      if (superPrimary) return new Set()
      if (!prev.has(primary)) return prev
      const next = new Set(prev)
      next.delete(primary)
      return next
    })
  }, [primary, superPrimary])

  const selected = useMemo(() => [primary, ...[...extra].sort()], [primary, extra])
  const preview = useQuery({
    queryKey: ['access-preview', selected],
    queryFn: () => userManagementService.accessPreview(selected),
    enabled: Boolean(primary),
    placeholderData: keepPreviousData,
  })

  const original = [user.role_id, ...user.additional_roles.map((r) => r.id).sort()].join()
  const dirty = selected.join() !== original
  const first = user.full_name.split(' ')[0]

  /** Why a role can’t be ticked right now, or null. */
  const blockedBy = (id: string): string | null => {
    if (superPrimary) return 'A super admin already has every permission.'
    const clash = conflictsOf(id).find((c) => selected.includes(c.id) && c.id !== id)
    return clash ? `Can’t be combined with ${roleLabel(clash.name)}.` : null
  }

  const toggle = (id: string, on: boolean) =>
    setExtra((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await userManagementService.setRoles(user.id, primary, [...extra])
      onSaved()
      onClose()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, { action: string; roles: string[] }[]>()
    for (const p of preview.data?.permissions ?? []) {
      const [resource, action] = p.permission.split(':')
      map.set(resource, [...(map.get(resource) ?? []), { action, roles: p.roles }])
    }
    return [...map.entries()].sort(([a], [b]) => resourceLabel(a).localeCompare(resourceLabel(b)))
  }, [preview.data])
  const permissionCount = preview.data?.permissions.length ?? 0
  const shared = preview.data?.permissions.filter((p) => p.roles.length > 1).length ?? 0
  const optional = roles.filter((r) => r.id !== primary && !PRIMARY_ONLY.includes(r.name))

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      busy={busy}
      title={`${first}’s roles`}
      description={user.email}
      className="max-w-3xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" isLoading={busy} disabled={!dirty || Boolean(preview.data?.conflicts.length)} onClick={save}>
            Save roles
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {error && <Alert>{error}</Alert>}
        {assignable.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : assignable.isError ? (
          <Alert>{getErrorMessage(assignable.error, 'Roles could not be loaded.')}</Alert>
        ) : (
          <div className="grid gap-8 md:grid-cols-2">
            <div className="flex flex-col gap-5">
              <SelectField
                label="Primary role"
                hint="Their title in People and on Home."
                options={roles.map((r) => ({ value: r.id, label: roleLabel(r.name) }))}
                value={primary}
                onChange={(e) => setPrimary(e.target.value)}
              />
              <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
                <legend className="text-body font-medium text-ink">Additional roles</legend>
                <p className="mb-1 text-meta text-muted">They can also do everything these roles can.</p>
                <ul className="m-0 list-none border-t border-line p-0">
                  {optional.map((r) => {
                    const checked = extra.has(r.id)
                    const reason = checked ? null : blockedBy(r.id)
                    return (
                      <li key={r.id} className="border-b border-line-soft">
                        <label
                          className={cn(
                            'flex items-start gap-3 py-2.5',
                            reason ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-row-hover',
                          )}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 accent-navy"
                            checked={checked}
                            disabled={Boolean(reason)}
                            onChange={(e) => toggle(r.id, e.target.checked)}
                          />
                          <span className="flex min-w-0 flex-col">
                            <span className="text-body text-ink">{roleLabel(r.name)}</span>
                            <span className="text-meta text-muted">{reason ?? r.description ?? ''}</span>
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </fieldset>
            </div>

            <section aria-labelledby="access-heading" className="flex min-w-0 flex-col gap-2">
              <h3 id="access-heading" className="text-body font-medium text-ink">
                What {first} will be able to do
              </h3>
              <p className="text-meta text-muted">
                {rolesLabel(selected.map(nameOf).filter(Boolean))} · {permissionCount}{' '}
                {permissionCount === 1 ? 'permission' : 'permissions'}
                {shared > 0 && `, ${shared} shared by more than one role`}
              </p>
              {preview.data?.conflicts.map(([a, b]) => (
                <Alert key={`${a}-${b}`}>
                  {roleLabel(a)} and {roleLabel(b)} can’t be held by the same person.
                </Alert>
              ))}
              {preview.isLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : preview.isError ? (
                <Alert>{getErrorMessage(preview.error, 'The preview could not be loaded.')}</Alert>
              ) : (
                <div className={cn('border-t border-line', preview.isFetching && 'opacity-70 transition-opacity')}>
                  {grouped.map(([resource, perms]) => (
                    <div key={resource} className="border-b border-line-soft py-2.5">
                      <h4 className="text-meta font-semibold text-ink">{resourceLabel(resource)}</h4>
                      <ul className="m-0 list-none p-0">
                        {perms.map((p) => (
                          <li key={p.action} className="flex items-baseline justify-between gap-3 py-0.5">
                            <span className="text-body text-ink">{actionLabel(p.action)}</span>
                            {selected.length > 1 && (
                              <span className="shrink-0 text-right text-meta text-muted">{p.roles.map(roleLabel).join(', ')}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
        <p className="text-body text-muted">{first} is signed out everywhere and gets the new access when they sign back in.</p>
      </div>
    </Dialog>
  )
}
