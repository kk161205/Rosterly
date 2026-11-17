import React, { useState } from 'react'
import { Plus, Edit2, Trash2 } from 'lucide-react'
import {
  PageHeader,
  Button,
  Status,
  EmptyState,
  ErrorState,
  Skeleton,
  Dialog,
  Alert,
} from '@/ui'
import {
  useApprovalChainMutations,
  useApprovalChains,
} from '@/features/approvalChains/hooks/useApprovalChains'
import { ApprovalChainStepper } from '@/features/approvalChains/components/ApprovalChainStepper'
import { ChainTemplateModal } from '@/features/approvalChains/components/ChainTemplateModal'
import { InFlightWarning } from '@/features/approvalChains/components/InFlightWarning'
import type {
  ChainRequestType,
  ChainTemplateCreate,
  ChainTemplateResponse,
  ChainTemplateUpdate,
} from '@/features/approvalChains/types/approvalChains'

const REQUEST_TYPE_TABS: { id: ChainRequestType | 'all'; label: string }[] = [
  { id: 'all', label: 'All Chains' },
  { id: 'asset_request', label: 'Asset Requests' },
  { id: 'access_request', label: 'Access Requests' },
  { id: 'it_ticket', label: 'IT Tickets' },
  { id: 'other', label: 'Other' },
]

export const ApprovalChainConfigPage: React.FC = () => {
  const [selectedType, setSelectedType] = useState<ChainRequestType | 'all'>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<ChainTemplateResponse | null>(null)
  const [deletingTemplate, setDeletingTemplate] = useState<ChainTemplateResponse | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const { data, isLoading, isError, error, refetch } = useApprovalChains(
    selectedType === 'all' ? undefined : selectedType,
  )
  const { createTemplate, updateTemplate, deleteTemplate } = useApprovalChainMutations()

  const templates = data?.templates || []
  const totalInFlight = templates.reduce((acc, t) => acc + (t.pending_request_count || 0), 0)

  const handleOpenCreate = () => {
    setEditingTemplate(null)
    setModalOpen(true)
    setActionError(null)
  }

  const handleOpenEdit = (template: ChainTemplateResponse) => {
    setEditingTemplate(template)
    setModalOpen(true)
    setActionError(null)
  }

  const handleSave = async ({
    isEdit,
    id,
    createData,
    updateData,
  }: {
    isEdit: boolean
    id?: string
    createData?: ChainTemplateCreate
    updateData?: ChainTemplateUpdate
  }) => {
    setActionError(null)
    if (isEdit && id && updateData) {
      await updateTemplate.mutateAsync({ id, data: updateData })
    } else if (createData) {
      await createTemplate.mutateAsync(createData)
    }
  }

  const handleDelete = async () => {
    if (!deletingTemplate) return
    try {
      setActionError(null)
      await deleteTemplate.mutateAsync(deletingTemplate.id)
      setDeletingTemplate(null)
    } catch (err: unknown) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Could not delete approval chain template. Ensure no in-flight requests reference it.',
      )
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Approval Chains"
        description="Configure multi-step routing rules, threshold conditions, and role-based approval sequences."
        actions={
          <Button variant="primary" onClick={handleOpenCreate}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            New Approval Chain
          </Button>
        }
      />

      <InFlightWarning pendingCount={totalInFlight} />

      {actionError && <Alert tone="error">{actionError}</Alert>}

      {/* Filter tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line pb-3" role="tablist">
        {REQUEST_TYPE_TABS.map((tab) => {
          const isActive = selectedType === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setSelectedType(tab.id)}
              className={`rounded-pill px-3.5 py-1 text-body font-medium transition-colors ${
                isActive
                  ? 'bg-ink text-paper'
                  : 'bg-ground text-muted hover:bg-row-hover hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-4 py-4" aria-label="Loading approval chains">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'Could not load approval chains.'}
          onRetry={() => refetch()}
        />
      ) : templates.length === 0 ? (
        <EmptyState
          title="No approval chains configured"
          description="Create your first multi-step approval workflow for this request type."
          action={
            <Button variant="secondary" onClick={handleOpenCreate}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Configure chain
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {templates.map((template) => (
            <div
              key={template.id}
              className="flex flex-col gap-3 rounded-card border border-line bg-paper p-5 transition-shadow"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2.5">
                    <h3 className="font-display text-panel text-ink">{template.name}</h3>
                    <Status value={template.is_active ? 'active' : 'inactive'} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-meta text-muted">
                    <span className="font-semibold uppercase text-ink">
                      {template.request_type.replace(/_/g, ' ')}
                    </span>
                    <span>•</span>
                    <span>
                      {template.min_amount != null
                        ? `Cost threshold: ≥ ₹${Number(template.min_amount).toLocaleString('en-IN')}`
                        : 'Applies to all amounts'}
                    </span>
                    <span>•</span>
                    <span
                      className={
                        template.pending_request_count > 0 ? 'font-medium text-status-warn' : ''
                      }
                    >
                      {template.pending_request_count}{' '}
                      {template.pending_request_count === 1 ? 'request' : 'requests'} in flight
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleOpenEdit(template)}
                  >
                    <Edit2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                    Edit
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setDeletingTemplate(template)}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                    Delete
                  </Button>
                </div>
              </div>

              {template.warning && <Alert tone="info">{template.warning}</Alert>}

              {/* Stepper preview */}
              <div className="mt-2 rounded-card border border-line-soft bg-ground/30 p-3">
                <ApprovalChainStepper steps={template.steps} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor Modal */}
      <ChainTemplateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        template={editingTemplate}
        onSave={handleSave}
        isPending={createTemplate.isPending || updateTemplate.isPending}
      />

      {/* Delete Confirmation Dialog */}
      {deletingTemplate && (
        <Dialog
          open={Boolean(deletingTemplate)}
          onOpenChange={(o) => !o && setDeletingTemplate(null)}
          title={`Delete "${deletingTemplate.name}"?`}
          description={
            deletingTemplate.pending_request_count > 0
              ? `This chain template has ${deletingTemplate.pending_request_count} active requests currently in flight. Deleting it is restricted to preserve audit integrity and request routing.`
              : 'This template will be permanently removed. Any future requests will route through the default chain for this category.'
          }
          busy={deleteTemplate.isPending}
          footer={
            <div className="flex w-full items-center justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setDeletingTemplate(null)}
                disabled={deleteTemplate.isPending}
              >
                Cancel
              </Button>
              {deletingTemplate.pending_request_count === 0 && (
                <Button
                  variant="danger"
                  onClick={handleDelete}
                  disabled={deleteTemplate.isPending}
                >
                  Delete Chain
                </Button>
              )}
            </div>
          }
        >
          {deletingTemplate.pending_request_count > 0 && (
            <Alert tone="error">
              In-flight requests must be approved or resolved before this approval chain can be removed.
            </Alert>
          )}
        </Dialog>
      )}
    </div>
  )
}
