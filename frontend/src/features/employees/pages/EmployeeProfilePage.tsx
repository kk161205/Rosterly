import React, { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as Menu from '@radix-ui/react-dropdown-menu'
import { Lock, MoreHorizontal, Upload } from 'lucide-react'
import { profileService } from '@/features/employees/services/profileService'
import { employeeService } from '@/features/employees/services/employeeService'
import { EditProfileDialog } from '@/features/employees/components/EditProfileDialog'
import { StartOffboardingDialog } from '@/features/lifecycle/components/StartOffboardingDialog'
import type { EmployeeProfile } from '@/features/employees/types/profile'
import { roleLabel, useCurrentUser } from '@/features/auth/hooks/useCurrentUser'
import { getErrorMessage, getErrorStatus } from '@/lib/errors'
import { formatDate, humanize } from '@/lib/format'
import {
  Alert,
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  SelectField,
  Skeleton,
  Status,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from '@/ui'

/**
 * Profile (§5.4): who someone is, what they hold, their documents and their
 * joiner/leaver checklist. /profile shows the signed-in user's own.
 */
export const EmployeeProfilePage: React.FC = () => {
  const params = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, can } = useCurrentUser()
  const id = params.id ?? user?.id
  const isSelf = Boolean(user && id === user.id)
  const profile = useQuery({ queryKey: ['profile', id], queryFn: () => profileService.getEmployeeProfile(id!), enabled: Boolean(id) })
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [offboarding, setOffboarding] = useState(false)

  if (!id || profile.isLoading) {
    return (
      <div className="flex flex-col gap-4" aria-label="Loading profile">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }
  if (profile.isError || !profile.data) {
    const status = getErrorStatus(profile.error)
    return status === 403 || status === 404 ? (
      <EmptyState
        title={status === 404 ? 'Person not found' : 'You can’t open this profile'}
        description={status === 404 ? 'They may have been removed, or the link is wrong.' : 'Profiles are visible to HR, admins, their manager and the person themselves.'}
        action={
          <Button variant="secondary" onClick={() => navigate('/employees')}>
            Back to directory
          </Button>
        }
      />
    ) : (
      <ErrorState message={getErrorMessage(profile.error, 'The profile could not be loaded.')} onRetry={() => profile.refetch()} />
    )
  }

  const p = profile.data
  const canEditAll = can('employee:update') && !isSelf
  const canEditSelf = isSelf
  const canOffboard = can('employee:update') && !isSelf && (p.status === 'active' || p.status === 'onboarding')
  const canDelete = can('employee:delete') && !isSelf
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['profile', id] })

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3.5">
        {!isSelf && (
          <nav aria-label="Breadcrumb" className="text-meta text-muted">
            <Link to="/employees" className="hover:text-ink hover:underline">
              Directory
            </Link>
            <span aria-hidden="true"> / </span>
            <span>{p.full_name}</span>
          </nav>
        )}
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="text-balance font-display text-page text-ink">{isSelf ? 'Your profile' : p.full_name}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body">
              <Status value={p.status} />
              <span className="text-muted">
                {isSelf && `${p.full_name} · `}
                {p.designation}
                {p.department_name && ` · ${p.department_name}`}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(canEditAll || canEditSelf) && (
              <Button variant="primary" onClick={() => setEditing(true)}>
                {canEditAll ? 'Edit profile' : 'Edit contact details'}
              </Button>
            )}
            {(canOffboard || canDelete) && (
              <ProfileMenu
                canOffboard={canOffboard}
                canDelete={canDelete}
                onOffboard={() => setOffboarding(true)}
                onDelete={() => setDeleting(true)}
              />
            )}
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList label="Profile sections">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="equipment">Equipment</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="lifecycle">Joining and leaving</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="pt-6 focus:outline-none">
          <Overview p={p} />
        </TabsContent>
        <TabsContent value="equipment" className="pt-6 focus:outline-none">
          <Equipment id={p.id} />
        </TabsContent>
        <TabsContent value="documents" className="pt-6 focus:outline-none">
          <Documents id={p.id} canUpload={isSelf || can('employee:update')} canDelete={can('employee:update')} />
        </TabsContent>
        <TabsContent value="lifecycle" className="pt-6 focus:outline-none">
          <Lifecycle id={p.id} />
        </TabsContent>
      </Tabs>

      <EditProfileDialog profile={p} full={canEditAll} open={editing} onOpenChange={setEditing} onSaved={refresh} />
      <StartOffboardingDialog person={p} open={offboarding} onOpenChange={setOffboarding} onStarted={() => void refresh()} />
      <DeleteEmployeeDialog
        profile={p}
        open={deleting}
        onOpenChange={setDeleting}
        onDeleted={() => {
          void queryClient.invalidateQueries({ queryKey: ['employees'] })
          navigate('/employees', { replace: true })
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------- overview

const Fact: React.FC<{ label: string; children: React.ReactNode; mono?: boolean }> = ({ label, children, mono }) => (
  <div className="flex justify-between gap-4 border-b border-line-soft py-2.5 text-body sm:flex-col sm:justify-start sm:gap-0.5">
    <dt className="text-muted">{label}</dt>
    <dd className={cn('m-0 text-right text-ink sm:text-left', mono && 'font-mono text-meta sm:text-body')}>{children}</dd>
  </div>
)

const Overview: React.FC<{ p: EmployeeProfile }> = ({ p }) => (
  <div className="grid gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
    <section aria-labelledby="about-heading">
      <h2 id="about-heading" className="mb-3 text-section text-ink">
        Details
      </h2>
      <dl className="m-0 grid border-t border-ink sm:grid-cols-2 sm:gap-x-10">
        <Fact label="Email">
          <a href={`mailto:${p.email}`} className="text-navy underline decoration-control underline-offset-4">
            {p.email}
          </a>
        </Fact>
        <Fact label="Phone">{p.phone || '—'}</Fact>
        <Fact label="Employee code" mono>
          {p.employee_code}
        </Fact>
        <Fact label={p.additional_roles?.length ? 'Roles' : 'Role'}>
          {[p.role_name, ...(p.additional_roles ?? []).map((r) => r.name)].map(roleLabel).join(' + ')}
        </Fact>
        <Fact label="Department">{p.department_name ?? '—'}</Fact>
        <Fact label="Reports to">
          {p.manager ? (
            <Link to={`/employees/${p.manager.id}`} className="hover:underline">
              {p.manager.full_name}
            </Link>
          ) : (
            '—'
          )}
        </Fact>
        <Fact label="Joined">{formatDate(p.date_of_joining)}</Fact>
        {p.date_of_exit && <Fact label="Last day">{formatDate(p.date_of_exit)}</Fact>}
        <Fact label="Emergency contact">
          {p.emergency_contact_name ? `${p.emergency_contact_name}${p.emergency_contact_phone ? ` · ${p.emergency_contact_phone}` : ''}` : '—'}
        </Fact>
      </dl>
    </section>
    <section aria-labelledby="reports-heading">
      <h2 id="reports-heading" className="mb-3 text-section text-ink">
        Direct reports
      </h2>
      {p.direct_reports.length === 0 ? (
        <p className="border-t border-ink pt-3 text-body text-muted">No one reports to {p.full_name.split(' ')[0]}.</p>
      ) : (
        <ul className="m-0 list-none border-t border-ink p-0">
          {p.direct_reports.map((r) => (
            <li key={r.id} className="border-b border-line-soft">
              <Link to={`/employees/${r.id}`} className="flex flex-col gap-0.5 py-2.5 hover:bg-row-hover">
                <span className="text-body text-ink">{r.full_name}</span>
                <span className="text-meta text-muted">{r.designation}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  </div>
)

// ---------------------------------------------------------------- equipment

const Equipment: React.FC<{ id: string }> = ({ id }) => {
  const q = useQuery({ queryKey: ['profile', id, 'assets'], queryFn: () => profileService.getEmployeeAssets(id) })
  if (q.isLoading) return <Skeleton className="h-32 w-full" />
  if (q.isError) return <ErrorState message={getErrorMessage(q.error)} onRetry={() => q.refetch()} />
  const { current, history } = q.data ?? { current: [], history: [] }
  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="current-heading">
        <h2 id="current-heading" className="mb-3 text-section text-ink">
          Has now
        </h2>
        {current.length === 0 ? (
          <p className="border-t border-ink pt-3 text-body text-muted">Nothing assigned right now.</p>
        ) : (
          <ul className="m-0 list-none border-t border-ink p-0">
            {current.map((a) => (
              <li key={a.id} className="border-b border-line-soft">
                <Link to={`/assets/${a.asset_id}`} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3 hover:bg-row-hover">
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-body font-medium text-ink">{a.asset_name}</span>
                    <span className="text-meta text-muted">
                      <span className="font-mono">{a.asset_tag}</span> · {humanize(a.category)}
                    </span>
                  </span>
                  <span className="text-meta text-muted">Since {formatDate(a.assigned_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      {history.length > 0 && (
        <section aria-labelledby="history-heading">
          <h2 id="history-heading" className="mb-3 text-section text-ink">
            Returned
          </h2>
          <ul className="m-0 list-none border-t border-ink p-0">
            {history.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line-soft py-3">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-body text-ink">{a.asset_name}</span>
                  <span className="font-mono text-meta text-muted">{a.asset_tag}</span>
                </span>
                <span className="text-meta text-muted">
                  {formatDate(a.assigned_at)} – {formatDate(a.returned_at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- documents

const DOC_TYPES = [
  { value: 'contract', label: 'Contract' },
  { value: 'offer_letter', label: 'Offer letter' },
  { value: 'id_proof', label: 'ID proof' },
  { value: 'policy_ack', label: 'Policy acknowledgement' },
  { value: 'other', label: 'Other' },
]

const Documents: React.FC<{ id: string; canUpload: boolean; canDelete: boolean }> = ({ id, canUpload, canDelete }) => {
  const queryClient = useQueryClient()
  const q = useQuery({ queryKey: ['profile', id, 'documents'], queryFn: () => profileService.getEmployeeDocuments(id) })
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['profile', id, 'documents'] })
  const docType = (t: string) => DOC_TYPES.find((d) => d.value === t)?.label ?? humanize(t)

  return (
    <section aria-labelledby="docs-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="docs-heading" className="text-section text-ink">
          Documents
        </h2>
        {canUpload && (
          <Button variant="secondary" size="sm" onClick={() => setUploading(true)}>
            <Upload className="h-4 w-4" aria-hidden="true" />
            Upload
          </Button>
        )}
      </div>
      {error && <Alert>{error}</Alert>}
      {q.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : q.isError ? (
        <ErrorState message={getErrorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (q.data ?? []).length === 0 ? (
        <p className="border-t border-ink pt-3 text-body text-muted">No documents yet.</p>
      ) : (
        <ul className="m-0 list-none border-t border-ink p-0">
          {(q.data ?? []).map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line-soft py-3">
              <span className="flex min-w-0 flex-col gap-0.5">
                <a href={d.file_url} target="_blank" rel="noreferrer" className="truncate text-body font-medium text-navy underline decoration-control underline-offset-4">
                  {d.file_name}
                </a>
                <span className="flex flex-wrap items-center gap-x-2 text-meta text-muted">
                  {docType(d.doc_type)} · {formatDate(d.uploaded_at)}
                  {d.uploaded_by_name && ` · by ${d.uploaded_by_name}`}
                  {d.is_confidential && (
                    <span className="inline-flex items-center gap-1">
                      · <Lock className="h-3 w-3" aria-hidden="true" /> Confidential
                    </span>
                  )}
                </span>
              </span>
              {canDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  isLoading={removing === d.id}
                  onClick={async () => {
                    setRemoving(d.id)
                    setError(null)
                    try {
                      await profileService.deleteEmployeeDocument(id, d.id)
                      await refresh()
                    } catch (err) {
                      setError(getErrorMessage(err))
                    } finally {
                      setRemoving(null)
                    }
                  }}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <UploadDialog id={id} open={uploading} onOpenChange={setUploading} onDone={refresh} />
    </section>
  )
}

const UploadDialog: React.FC<{ id: string; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }> = ({
  id,
  open,
  onOpenChange,
  onDone,
}) => {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [type, setType] = useState('contract')
  const [confidential, setConfidential] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setFile(null)
    setType('contract')
    setConfidential(false)
    setError(null)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
      title="Upload a document"
      description="PDF, PNG or JPG, up to 10 MB."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            isLoading={busy}
            disabled={!file}
            onClick={async () => {
              if (!file) return
              setBusy(true)
              setError(null)
              try {
                await profileService.uploadEmployeeDocument(id, file, type, confidential)
                onDone()
                reset()
                onOpenChange(false)
              } catch (err) {
                setError(err instanceof Error && !('isAxiosError' in err) ? err.message : getErrorMessage(err))
              } finally {
                setBusy(false)
              }
            }}
          >
            Upload
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {error && <Alert>{error}</Alert>}
        <div className="flex flex-col gap-1.5">
          <span className="text-body font-medium text-ink">File</span>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
              Choose file
            </Button>
            <span className="truncate text-body text-muted">{file ? file.name : 'No file chosen'}</span>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
            className="sr-only"
            aria-label="File"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <SelectField label="Type" options={DOC_TYPES} value={type} onChange={(e) => setType(e.target.value)} />
        <label className="flex cursor-pointer items-start gap-2.5 text-body text-ink">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-navy" checked={confidential} onChange={(e) => setConfidential(e.target.checked)} />
          <span>
            Confidential
            <span className="block text-meta text-muted">Only HR, admins and the person can see it.</span>
          </span>
        </label>
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------------- lifecycle

const Lifecycle: React.FC<{ id: string }> = ({ id }) => {
  const q = useQuery({ queryKey: ['profile', id, 'lifecycle'], queryFn: () => profileService.getEmployeeLifecycle(id) })
  if (q.isLoading) return <Skeleton className="h-32 w-full" />
  if (q.isError) return <ErrorState message={getErrorMessage(q.error)} onRetry={() => q.refetch()} />
  const c = q.data
  if (!c) return <p className="text-body text-muted">No onboarding or offboarding checklist on record.</p>
  const done = (s: string) => s === 'done' || s === 'completed'
  return (
    <section aria-labelledby="lifecycle-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="lifecycle-heading" className="text-section text-ink">
          {humanize(c.type)} checklist
        </h2>
        <span className="text-meta text-muted">
          {c.completed_items} of {c.total_items} done
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-pill bg-line" aria-hidden="true">
        <div className="h-full bg-navy" style={{ width: `${c.progress_percentage}%` }} />
      </div>
      <ul className="m-0 mt-2 list-none border-t border-ink p-0">
        {c.items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line-soft py-3">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className={cn('text-body', done(item.status) ? 'text-muted line-through decoration-control' : 'text-ink')}>
                {item.title}
              </span>
              <span className="text-meta text-muted">{roleLabel(item.owner_role)}</span>
            </span>
            <Status value={item.status} />
          </li>
        ))}
      </ul>
      <Link to={`/${c.type === 'offboarding' ? 'offboarding' : 'onboarding'}`} className="self-start text-body text-navy underline decoration-control underline-offset-4">
        Open in {humanize(c.type)}
      </Link>
    </section>
  )
}

// ---------------------------------------------------------------- menu + delete

const ProfileMenu: React.FC<{ canOffboard: boolean; canDelete: boolean; onOffboard: () => void; onDelete: () => void }> = ({
  canOffboard,
  canDelete,
  onOffboard,
  onDelete,
}) => {
  const item = 'flex min-h-9 cursor-pointer select-none items-center rounded-soft px-3 text-body outline-none data-[highlighted]:bg-row-hover'
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label="More actions"
        className="inline-flex h-10 w-10 items-center justify-center rounded-pill border border-ink text-ink transition-colors hover:bg-ink hover:text-paper data-[state=open]:bg-ink data-[state=open]:text-paper"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={6} className="z-50 min-w-52 rounded-card border border-line bg-paper p-1.5">
          {canOffboard && (
            <Menu.Item className={cn(item, 'text-ink')} onSelect={onOffboard}>
              Start offboarding
            </Menu.Item>
          )}
          {canDelete && (
            <>
              {canOffboard && <Menu.Separator className="my-1.5 h-px bg-line" />}
              <Menu.Item className={cn(item, 'text-status-bad')} onSelect={onDelete}>
                Delete account
              </Menu.Item>
            </>
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}

const DeleteEmployeeDialog: React.FC<{
  profile: EmployeeProfile
  open: boolean
  onOpenChange: (o: boolean) => void
  onDeleted: () => void
}> = ({ profile, open, onOpenChange, onDeleted }) => {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      title={`Delete ${profile.full_name}'s account?`}
      description="They're signed out and can no longer sign in. Their records stay for audit."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Keep account
          </Button>
          <Button
            variant="danger"
            isLoading={busy}
            onClick={async () => {
              setBusy(true)
              setError(null)
              try {
                await employeeService.deleteEmployee(profile.id)
                onDeleted()
              } catch (err) {
                setError(getErrorMessage(err))
              } finally {
                setBusy(false)
              }
            }}
          >
            Delete account
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {error && <Alert>{error}</Alert>}
        <p className="text-body text-muted">To let someone leave properly — collect devices, revoke access — use Start offboarding instead.</p>
      </div>
    </Dialog>
  )
}
