import React, { useState } from 'react'
import { Plus } from 'lucide-react'
import { Alert, Button, Dialog, EmptyState, ErrorState, FilterTabs, PageHeader, Skeleton, Status } from '@/ui'
import { formatMoney } from '@/lib/format'
import { useApprovalChainMutations, useApprovalChains } from '@/features/approvalChains/hooks/useApprovalChains'
import { ApprovalChainStepper } from '@/features/approvalChains/components/ApprovalChainStepper'
import { ChainTemplateModal } from '@/features/approvalChains/components/ChainTemplateModal'
import { REQUEST_TYPE_LABEL } from '@/features/approvalChains/lib/labels'
import { getErrorMessage } from '@/lib/errors'
import type {
  ChainRequestType,
  ChainTemplateCreate,
  ChainTemplateResponse,
  ChainTemplateUpdate,
} from '@/features/approvalChains/types/approvalChains'

type Filter = ChainRequestType | 'all'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  ...(Object.keys(REQUEST_TYPE_LABEL) as ChainRequestType[]).map((value) => ({ value, label: REQUEST_TYPE_LABEL[value] })),
]

/** who approves each kind of request. */
export const ApprovalChainConfigPage: React.FC = () => {
  const [filter, setFilter] = useState<Filter>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ChainTemplateResponse | null>(null)
  const [deleting, setDeleting] = useState<ChainTemplateResponse | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const { data, isLoading, isError, error, refetch } = useApprovalChains(filter === 'all' ? undefined : filter)
  const { createTemplate, updateTemplate, deleteTemplate } = useApprovalChainMutations()
  const templates = data?.templates ?? []

  const openEditor = (template: ChainTemplateResponse | null) => {
    setEditing(template)
    setModalOpen(true)
    setActionError(null)
  }

  const handleSave = async ({ isEdit, id, createData, updateData }: { isEdit: boolean; id?: string; createData?: ChainTemplateCreate; updateData?: ChainTemplateUpdate }) => {
    setActionError(null)
    if (isEdit && id && updateData) {
      const saved = await updateTemplate.mutateAsync({ id, data: updateData })
      if (saved?.warning) setActionError(saved.warning)
    }
    else if (createData) await createTemplate.mutateAsync(createData)
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      setActionError(null)
      await deleteTemplate.mutateAsync(deleting.id)
      setDeleting(null)
    } catch (err: unknown) {
      setActionError(getErrorMessage(err, 'Couldn’t delete the chain. Try again.'))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Approval chains"
        description="Who approves each kind of request. Changes apply to new requests; ones already waiting keep their approvers."
        actions={
          <Button data-guide="chains.new" variant="primary" onClick={() => openEditor(null)}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            New chain
          </Button>
        }
      />

      {actionError && <Alert tone="error">{actionError}</Alert>}

      <FilterTabs<Filter> data-guide="chains.filter" label="Kind of request" value={filter} onChange={setFilter} tabs={FILTERS} />

      {isLoading ? (
        <div className="flex flex-col gap-4" aria-label="Loading approval chains">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : isError ? (
        <ErrorState message={getErrorMessage(error, 'Couldn’t load approval chains.')} onRetry={() => refetch()} />
      ) : templates.length === 0 ? (
        <EmptyState
          title="No approval chains"
          description="Without a chain, requests of this kind have no one to approve them. Add one to say who does."
          action={
            <Button variant="secondary" onClick={() => openEditor(null)}>
              Add a chain
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-8">
          {templates.map((t) => (
            <section key={t.id} aria-labelledby={`chain-${t.id}`} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ink pb-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h2 id={`chain-${t.id}`} className="text-section text-ink">
                    {t.name}
                  </h2>
                  {!t.is_active && <Status value="inactive" />}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEditor(t)}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleting(t)} aria-label={`Delete ${t.name}`}>
                    Delete
                  </Button>
                </div>
              </div>
              <p className="text-meta text-muted">
                {REQUEST_TYPE_LABEL[t.request_type]} · {t.min_amount != null ? `${formatMoney(t.min_amount)} and above` : 'any cost'}
                {t.pending_request_count > 0 && (
                  <span className="text-status-warn">
                    {' '}
                    · {t.pending_request_count} {t.pending_request_count === 1 ? 'request' : 'requests'} waiting
                  </span>
                )}
              </p>
              <ApprovalChainStepper steps={t.steps} />
              {t.warning && <p className="text-meta text-status-warn">{t.warning}</p>}
            </section>
          ))}
        </div>
      )}

      <ChainTemplateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        template={editing}
        onSave={handleSave}
        isPending={createTemplate.isPending || updateTemplate.isPending}
      />

      {deleting && (
        <Dialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          title={`Delete “${deleting.name}”?`}
          busy={deleteTemplate.isPending}
          footer={
            <div className="flex w-full items-center justify-end gap-2">
              <Button variant="secondary" onClick={() => setDeleting(null)} disabled={deleteTemplate.isPending}>
                {deleting.pending_request_count > 0 ? 'Close' : 'No, keep it'}
              </Button>
              {deleting.pending_request_count === 0 && (
                <Button variant="danger" onClick={handleDelete} disabled={deleteTemplate.isPending}>
                  Yes, delete
                </Button>
              )}
            </div>
          }
        >
          <p className="text-body text-muted">
            {deleting.pending_request_count > 0
              ? `${deleting.pending_request_count} ${deleting.pending_request_count === 1 ? 'request is' : 'requests are'} still waiting on this chain. Once they’re approved or rejected you can delete it — or switch it off now from Edit so new requests don’t use it.`
              : 'New requests of this kind will use your other chains for it.'}
          </p>
        </Dialog>
      )}
    </div>
  )
}
