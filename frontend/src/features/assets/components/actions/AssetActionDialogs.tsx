import React, { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { apiClient } from '@/lib/api-client'
import { getErrorMessage, getFieldErrors } from '@/lib/errors'
import { assetService } from '@/features/assets/services/assetService'
import { maintenanceService } from '@/features/assets/services/maintenanceService'
import { useCurrentUser } from '@/features/auth/hooks/useCurrentUser'
import { useRefreshAssets } from '@/features/assets/hooks/useAssets'
import type { Asset, AssetStatus, TicketPriority } from '@/features/assets/types/assets'
import { Alert, Button, Dialog, SelectField, TextAreaField, TextField, cn, statusLabel } from '@/ui'

/**
 * Asset actions (§5.7–§5.10), each a small dialog that calls the owning
 * endpoint and refreshes every asset view. Errors come back in the standard
 * envelope and are shown next to the form.
 */
interface ActionProps {
  asset: Pick<Asset, 'id' | 'name' | 'asset_tag'>
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone?: () => void
}

function useSubmit(onDone: () => void) {
  const refresh = useRefreshAssets()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const submit = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    setFieldErrors({})
    try {
      await fn()
      await refresh()
      onDone()
    } catch (err) {
      setError(getErrorMessage(err))
      setFieldErrors(getFieldErrors(err))
    } finally {
      setBusy(false)
    }
  }
  const reset = () => {
    setError(null)
    setFieldErrors({})
  }
  return { busy, error, fieldErrors, submit, reset }
}

// ---------------------------------------------------------------- assign

interface PersonOption {
  id: string
  full_name: string
  designation: string
  department_name: string | null
  status: string
}

export const AssignAssetDialog: React.FC<ActionProps> = ({ asset, open, onOpenChange, onDone }) => {
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')
  const [personId, setPersonId] = useState<string | null>(null)
  const [condition, setCondition] = useState('')
  const close = () => onOpenChange(false)
  const { busy, error, fieldErrors, submit, reset } = useSubmit(() => {
    close()
    onDone?.()
  })

  useEffect(() => {
    const t = setTimeout(() => setTerm(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])
  useEffect(() => {
    if (open) return
    setSearch('')
    setPersonId(null)
    setCondition('')
    reset()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const people = useQuery({
    queryKey: ['assign-picker', term],
    queryFn: async () =>
      (
        await apiClient.get<{ items: PersonOption[] }>('/employees', {
          params: { search: term || undefined, page_size: 6 },
        })
      ).data.items.filter((p) => p.status !== 'terminated' && p.status !== 'inactive'),
    enabled: open,
  })
  const chosen = people.data?.find((p) => p.id === personId)

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      title="Assign to someone"
      description={`${asset.name} · ${asset.asset_tag}`}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            isLoading={busy}
            disabled={!personId || !condition.trim()}
            onClick={() =>
              submit(() => assetService.assignAsset(asset.id, { employee_id: personId!, condition_notes: condition.trim() }))
            }
          >
            {chosen ? `Assign to ${chosen.full_name.split(' ')[0]}` : 'Assign'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {error && <Alert>{error}</Alert>}
        <div className="flex flex-col gap-2">
          <TextField
            label="Person"
            placeholder="Search by name, code or role"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            trailing={<Search className="mr-1 h-4 w-4 text-muted" aria-hidden="true" />}
            error={fieldErrors.employee_id}
          />
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0" aria-label="Matching people" role="radiogroup">
            {(people.data ?? []).map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={p.id === personId}
                  onClick={() => setPersonId(p.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-card border px-3 py-2.5 text-left transition-colors',
                    p.id === personId ? 'border-navy bg-navy-tint' : 'border-transparent hover:bg-row-hover',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-[1.5px]',
                      p.id === personId ? 'border-navy' : 'border-faint',
                    )}
                    aria-hidden="true"
                  >
                    {p.id === personId && <span className="h-2 w-2 rounded-full bg-navy" />}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-body font-medium text-ink">{p.full_name}</span>
                    <span className="truncate text-meta text-muted">
                      {[p.designation, p.department_name].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {people.data && people.data.length === 0 && (
              <li className="px-3 py-2 text-body text-muted">No one matches “{term}”.</li>
            )}
          </ul>
        </div>
        <TextAreaField
          label="Condition at hand-over"
          hint="Recorded on the assignment, e.g. “Good, charger included”."
          value={condition}
          onChange={(e) => setCondition(e.target.value)}
          error={fieldErrors.condition_notes}
        />
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------------- return

export const ReturnAssetDialog: React.FC<ActionProps & { holderName?: string | null }> = ({
  asset,
  holderName,
  open,
  onOpenChange,
  onDone,
}) => {
  const [condition, setCondition] = useState('')
  const close = () => onOpenChange(false)
  const { busy, error, fieldErrors, submit, reset } = useSubmit(() => {
    close()
    onDone?.()
  })
  useEffect(() => {
    if (!open) {
      setCondition('')
      reset()
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      title="Return to stock"
      description={`${asset.name} · ${asset.asset_tag}${holderName ? ` · from ${holderName}` : ''}`}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            isLoading={busy}
            disabled={!condition.trim()}
            onClick={() => submit(() => assetService.returnAsset(asset.id, { condition_notes: condition.trim() }))}
          >
            Return to stock
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}
        <TextAreaField
          label="Condition on return"
          hint="Note any damage or missing parts."
          value={condition}
          onChange={(e) => setCondition(e.target.value)}
          error={fieldErrors.condition_notes}
          autoFocus
        />
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------------- raise ticket

const PRIORITIES: { value: TicketPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
]

/** With an asset (record page, panel) or without one (Maintenance page): then pick it first. */
export { PRIORITIES }

export const RaiseTicketDialog: React.FC<Omit<ActionProps, 'asset'> & { asset?: ActionProps['asset'] }> = ({
  asset,
  open,
  onOpenChange,
  onDone,
}) => {
  const { user, can } = useCurrentUser()
  const [issue, setIssue] = useState('')
  const [priority, setPriority] = useState<TicketPriority>('medium')
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')
  const [pickedId, setPickedId] = useState<string | null>(null)
  const close = () => onOpenChange(false)
  const { busy, error, fieldErrors, submit, reset } = useSubmit(() => {
    close()
    onDone?.()
  })
  useEffect(() => {
    if (!open) {
      setIssue('')
      setPriority('medium')
      setSearch('')
      setPickedId(null)
      reset()
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setTimeout(() => setTerm(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])

  // IT can raise for any asset; everyone else only for what they hold (§5.10)
  const anyAsset = can('maintenance_ticket:create') && can('assets:read')
  const options = useQuery({
    queryKey: ['ticket-asset-picker', anyAsset, term],
    queryFn: () => maintenanceService.pickableAssets({ search: term, anyAsset, userId: user!.id }),
    enabled: open && !asset && Boolean(user),
  })
  const assetId = asset?.id ?? pickedId

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      title="Raise a ticket"
      description={asset ? `${asset.name} · ${asset.asset_tag}` : 'Tell IT what’s wrong with a device.'}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            isLoading={busy}
            disabled={!issue.trim() || !assetId}
            onClick={() =>
              submit(() =>
                assetService.createMaintenanceTicket({ asset_id: assetId!, issue_description: issue.trim(), priority }),
              )
            }
          >
            Raise ticket
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {error && <Alert>{error}</Alert>}
        {!asset && (
          <div className="flex flex-col gap-2">
            <TextField
              label="Asset"
              placeholder={anyAsset ? 'Search name, tag or serial number' : 'Filter your devices'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              trailing={<Search className="mr-1 h-4 w-4 text-muted" aria-hidden="true" />}
              error={fieldErrors.asset_id}
            />
            <ul className="m-0 flex max-h-56 list-none flex-col gap-0.5 overflow-y-auto p-0" role="radiogroup" aria-label="Assets">
              {(options.data ?? []).map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={a.id === pickedId}
                    onClick={() => setPickedId(a.id)}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-card border px-3 py-2.5 text-left transition-colors',
                      a.id === pickedId ? 'border-navy bg-navy-tint' : 'border-transparent hover:bg-row-hover',
                    )}
                  >
                    <span className="truncate text-body text-ink">{a.name}</span>
                    <span className="shrink-0 font-mono text-meta text-muted">{a.asset_tag}</span>
                  </button>
                </li>
              ))}
              {options.data && options.data.length === 0 && (
                <li className="px-3 py-2 text-body text-muted">
                  {anyAsset ? 'No assets match.' : 'You don’t have any devices assigned to you.'}
                </li>
              )}
            </ul>
          </div>
        )}
        <TextAreaField
          label="What's wrong?"
          hint="What happens, since when, and what you've tried."
          value={issue}
          onChange={(e) => setIssue(e.target.value)}
          error={fieldErrors.issue_description}
          autoFocus={Boolean(asset)}
        />
        <SelectField
          label="Priority"
          options={PRIORITIES}
          value={priority}
          onChange={(e) => setPriority(e.target.value as TicketPriority)}
        />
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------------- status (single or bulk)

/** Statuses a person may set directly; "assigned" only comes from Assign (§5.7 PATCH rules). */
const SETTABLE: AssetStatus[] = ['in_stock', 'under_maintenance', 'lost', 'retired']

export const ChangeStatusDialog: React.FC<{
  assets: Pick<Asset, 'id' | 'name' | 'asset_tag' | 'status'>[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone?: () => void
}> = ({ assets, open, onOpenChange, onDone }) => {
  const single = assets.length === 1 ? assets[0] : null
  const [status, setStatus] = useState<AssetStatus>('under_maintenance')
  const close = () => onOpenChange(false)
  const { busy, error, submit, reset } = useSubmit(() => {
    close()
    onDone?.()
  })
  useEffect(() => {
    if (!open) reset()
    else setStatus(single?.status === 'under_maintenance' ? 'in_stock' : 'under_maintenance')
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const options = SETTABLE.filter((s) => !single || s !== single.status).map((s) => ({ value: s, label: statusLabel(s) }))
  const holding = assets.some((a) => a.status === 'assigned')

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      title={single ? 'Change status' : `Change status of ${assets.length} assets`}
      description={single ? `${single.name} · ${single.asset_tag}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={status === 'retired' || status === 'lost' ? 'danger' : 'primary'}
            isLoading={busy}
            onClick={() =>
              submit(() =>
                single
                  ? assetService.updateAsset(single.id, { status })
                  : assetService.bulkUpdateAssets({ asset_ids: assets.map((a) => a.id), status }),
              )
            }
          >
            Set to {statusLabel(status).toLowerCase()}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}
        <SelectField
          label="New status"
          options={options}
          value={status}
          onChange={(e) => setStatus(e.target.value as AssetStatus)}
        />
        {status === 'retired' && (
          <p className="text-body text-muted">Retired is final — a retired asset can’t be brought back into use.</p>
        )}
        {holding && status !== 'retired' && (
          <p className="text-body text-muted">Assets that are assigned will be taken back from their holder.</p>
        )}
        {holding && status === 'retired' && (
          <p className="text-body text-muted">Assets that are assigned will also be taken back from their holder.</p>
        )}
      </div>
    </Dialog>
  )
}
