import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { profileService } from '@/features/employees/services/profileService'
import { EditProfileDialog } from '@/features/employees/components/EditProfileDialog'
import type { Employee } from '@/features/employees/types/employee'
import { StartOffboardingDialog } from '@/features/lifecycle/components/StartOffboardingDialog'
import { hasRole, useCurrentUser } from '@/features/auth/hooks/useCurrentUser'
import { getErrorStatus } from '@/lib/errors'
import { formatDate, humanize } from '@/lib/format'
import { Alert, Button, ButtonLink, DetailRow, SidePanel, Skeleton, Status } from '@/ui'

// Starting an offboarding is HR's and super admins' (§5.6, role-checked by the API)
const OFFBOARDERS = ['hr_admin', 'super_admin']

/**
 * A person from the directory (§5.3): contact details, what they hold, and —
 * for HR and super admins — Edit and Start offboarding without leaving the list.
 */
export const PersonPanel: React.FC<{ person: Employee | null; onClose: () => void }> = ({ person, onClose }) => {
  const { user, can } = useCurrentUser()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [offboarding, setOffboarding] = useState(false)
  const [startedFor, setStartedFor] = useState<string | null>(null)
  const id = person?.id

  const isSelf = Boolean(user && id === user.id)
  // Profiles need employee:read (§5.4) — everyone can open their own
  const canOpen = can('employee:read') || isSelf
  const canEdit = can('employee:update') && !isSelf
  const canOffboard =
    hasRole(user, ...OFFBOARDERS) && !isSelf && (person?.status === 'active' || person?.status === 'onboarding')

  // Who holds what (GET /employees/{id}/assets); the API decides who may see it
  const assets = useQuery({
    queryKey: ['profile', id, 'assets'],
    queryFn: () => profileService.getEmployeeAssets(id!),
    enabled: Boolean(id),
    retry: false,
  })
  // The full profile is only needed for editing (role, manager, emergency contact)
  const profile = useQuery({
    queryKey: ['profile', id],
    queryFn: () => profileService.getEmployeeProfile(id!),
    enabled: Boolean(id) && canEdit,
  })

  if (!person) return null
  const assetsHidden = assets.isError && (getErrorStatus(assets.error) === 403 || getErrorStatus(assets.error) === 404)
  const current = assets.data?.current ?? []

  return (
    <>
      <SidePanel
        open
        onOpenChange={(o) => !o && onClose()}
        title={person.full_name}
        description={person.designation}
        footer={
          (canOpen || canEdit || canOffboard) && (
            <div className="flex w-full flex-wrap gap-2">
              {canOpen && (
                <ButtonLink to={`/employees/${person.id}`} variant="primary" className="flex-1">
                  Open profile
                </ButtonLink>
              )}
              {canEdit && (
                <Button variant="secondary" className="flex-1" disabled={!profile.data} onClick={() => setEditing(true)}>
                  Edit
                </Button>
              )}
              {canOffboard && (
                <Button variant="danger" className="w-full" onClick={() => setOffboarding(true)}>
                  Start offboarding
                </Button>
              )}
            </div>
          )
        }
      >
        <div className="flex flex-col gap-6">
          <Status value={person.status} />
          {startedFor === person.id && (
            <Alert tone="success">
              Offboarding started.{' '}
              <Link to="/offboarding" className="font-medium underline underline-offset-4">
                Open the checklist
              </Link>
            </Alert>
          )}
          <dl className="m-0">
            <DetailRow label="Email">
              <a href={`mailto:${person.email}`} className="text-navy underline decoration-control underline-offset-4">
                {person.email}
              </a>
            </DetailRow>
            {person.phone && <DetailRow label="Phone">{person.phone}</DetailRow>}
            <DetailRow label="Department">{person.department_name ?? '—'}</DetailRow>
            <DetailRow label="Reports to">
              {person.manager_id && person.manager_name ? person.manager_name : <span className="text-muted">No one</span>}
            </DetailRow>
            {person.employee_code && (
              <DetailRow label="Employee code">
                <span className="font-mono text-meta">{person.employee_code}</span>
              </DetailRow>
            )}
            {person.date_of_joining && <DetailRow label="Joined">{formatDate(person.date_of_joining)}</DetailRow>}
          </dl>

          {!assetsHidden && (
            <section aria-labelledby="person-assets-heading" className="flex flex-col gap-1">
              <h3 id="person-assets-heading" className="text-body font-semibold text-ink">
                Assets
              </h3>
              {assets.isLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : current.length === 0 ? (
                <p className="text-body text-muted">No assets assigned.</p>
              ) : (
                <ul className="m-0 list-none p-0">
                  {current.map((a) => {
                    const body = (
                      <>
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-body text-ink">{a.asset_name}</span>
                          <span className="text-meta text-muted">
                            <span className="font-mono">{a.asset_tag}</span> · {humanize(a.category)}
                          </span>
                        </span>
                        <span className="shrink-0 text-meta text-muted">Since {formatDate(a.assigned_at)}</span>
                      </>
                    )
                    return (
                      <li key={a.id} className="border-t border-line-soft first:border-t-0">
                        {/* Asset records open for IT, auditors and the holder (§5.8) */}
                        {can('assets:read') || isSelf ? (
                          <Link to={`/assets/${a.asset_id}`} className="flex items-baseline justify-between gap-4 py-2.5 hover:bg-row-hover">
                            {body}
                          </Link>
                        ) : (
                          <div className="flex items-baseline justify-between gap-4 py-2.5">{body}</div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )}
        </div>
      </SidePanel>

      {profile.data && (
        <EditProfileDialog
          profile={profile.data}
          full
          open={editing}
          onOpenChange={setEditing}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: ['employees'] })
            void queryClient.invalidateQueries({ queryKey: ['profile', id] })
          }}
        />
      )}
      <StartOffboardingDialog
        person={person}
        open={offboarding}
        onOpenChange={setOffboarding}
        onStarted={() => setStartedFor(person.id)}
      />
    </>
  )
}
