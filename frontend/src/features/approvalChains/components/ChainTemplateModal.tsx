import React, { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Alert, Button, Dialog, IconButton, SelectField, TextField } from '@/ui'
import { roleLabel } from '@/features/auth/hooks/useCurrentUser'
import { useAssignableRoles } from '@/features/approvalChains/hooks/useApprovalChains'
import { CHAIN_APPROVER_ROLES, REQUEST_TYPE_LABEL } from '@/features/approvalChains/lib/labels'
import { getErrorMessage } from '@/lib/errors'
import type {
  ChainRequestType,
  ChainStepInput,
  ChainTemplateCreate,
  ChainTemplateResponse,
  ChainTemplateUpdate,
} from '@/features/approvalChains/types/approvalChains'

interface ChainTemplateModalProps {
  open: boolean
  onClose: () => void
  template?: ChainTemplateResponse | null
  onSave: (payload: { isEdit: boolean; id?: string; createData?: ChainTemplateCreate; updateData?: ChainTemplateUpdate }) => Promise<void>
  isPending?: boolean
}

const REQUEST_TYPE_OPTIONS = (Object.keys(REQUEST_TYPE_LABEL) as ChainRequestType[]).map((value) => ({ value, label: REQUEST_TYPE_LABEL[value] }))

/** Add or edit who approves a kind of request, in order. */
export const ChainTemplateModal: React.FC<ChainTemplateModalProps> = ({ open, onClose, template, onSave, isPending }) => {
  const isEdit = Boolean(template)
  const { data: rolesData } = useAssignableRoles()
  // Only roles that can approve requests; anything else would leave a request waiting forever.
  const roles = useMemo(() => (rolesData ?? []).filter((r) => CHAIN_APPROVER_ROLES.includes(r.name)), [rolesData])
  const roleOptions = roles.map((r) => ({ value: r.id, label: roleLabel(r.name) }))

  const [requestType, setRequestType] = useState<ChainRequestType>('asset_request')
  const [name, setName] = useState('')
  const [minAmount, setMinAmount] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [steps, setSteps] = useState<ChainStepInput[]>([])
  const [error, setError] = useState<string | null>(null)

  // Reset the form each time the dialog opens.
  useEffect(() => {
    if (!open) return
    setRequestType(template?.request_type ?? 'asset_request')
    setName(template?.name ?? '')
    setMinAmount(template?.min_amount != null ? String(template.min_amount) : '')
    setIsActive(template?.is_active ?? true)
    setSteps(template ? template.steps.map((s) => ({ step_order: s.step_order, approver_role_id: s.approver_role_id })) : [])
    setError(null)
  }, [template, open])

  // A new chain starts with one approver once the roles have loaded.
  const firstRoleId = roles[0]?.id
  useEffect(() => {
    if (open && !template && firstRoleId && steps.length === 0) setSteps([{ step_order: 1, approver_role_id: firstRoleId }])
  }, [open, template, firstRoleId, steps.length])

  const renumber = (list: ChainStepInput[]) => list.map((s, i) => ({ ...s, step_order: i + 1 }))
  const addStep = () => firstRoleId && setSteps((prev) => [...prev, { step_order: prev.length + 1, approver_role_id: firstRoleId }])
  const removeStep = (index: number) => setSteps((prev) => renumber(prev.filter((_, i) => i !== index)))
  const moveStep = (index: number, by: -1 | 1) =>
    setSteps((prev) => {
      const target = index + by
      if (target < 0 || target >= prev.length) return prev
      const copy = [...prev]
      ;[copy[index], copy[target]] = [copy[target], copy[index]]
      return renumber(copy)
    })
  const setRole = (index: number, roleId: string) => setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, approver_role_id: roleId } : s)))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('Give the chain a name.')
    if (steps.length === 0) return setError('Add at least one approver.')
    const managerSteps = steps.filter((s) => roles.find((r) => r.id === s.approver_role_id)?.name === 'manager').length
    if (managerSteps > 1) return setError('A chain can have only one Manager step — the same manager can’t approve twice.')
    const parsedMin = minAmount.trim() ? Number(minAmount) : null
    try {
      if (isEdit && template) {
        await onSave({ isEdit: true, id: template.id, updateData: { name: name.trim(), min_amount: parsedMin, is_active: isActive, steps } })
      } else {
        await onSave({ isEdit: false, createData: { request_type: requestType, name: name.trim(), min_amount: parsedMin, steps } })
      }
      onClose()
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Couldn’t save the chain. Try again.'))
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={isEdit ? 'Edit approval chain' : 'New approval chain'}
      description="Who approves this kind of request, in order."
      busy={isPending}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button data-guide="chains.save" variant="primary" onClick={handleSubmit} disabled={isPending}>
            {isEdit ? 'Save changes' : 'Create chain'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 pt-2">
        {error && <Alert tone="error">{error}</Alert>}

        {!isEdit && (
          <SelectField
            label="Kind of request"
            options={REQUEST_TYPE_OPTIONS}
            value={requestType}
            onChange={(e) => setRequestType(e.target.value as ChainRequestType)}
          />
        )}

        <TextField label="Name" placeholder="e.g. Expensive equipment" value={name} onChange={(e) => setName(e.target.value)} required />

        <TextField
          label="Only for requests costing at least (₹)"
          type="number"
          inputMode="numeric"
          min={0}
          value={minAmount}
          onChange={(e) => setMinAmount(e.target.value)}
          hint="Leave empty to use this chain for every request of this kind."
        />

        {isEdit && (
          <label className="flex min-h-10 cursor-pointer items-center gap-2.5 text-body text-ink">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded-soft accent-navy" />
            In use
          </label>
        )}

        <section aria-labelledby="chain-steps" className="flex flex-col">
          <div className="flex items-center justify-between border-b border-ink pb-2">
            <h3 id="chain-steps" className="text-section text-ink">
              Approvers, in order
            </h3>
            <Button type="button" variant="ghost" size="sm" onClick={addStep} disabled={isPending || !firstRoleId}>
              <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Add approver
            </Button>
          </div>
          <ol>
            {steps.map((step, idx) => (
              <li key={step.step_order} className="flex items-center gap-3 border-b border-line-soft py-2 last:border-b-0">
                <span className="w-5 shrink-0 text-meta text-muted" aria-hidden="true">
                  {step.step_order}.
                </span>
                <div className="flex-1">
                  <SelectField
                    label={`Approver ${step.step_order}`}
                    hideLabel
                    options={roleOptions}
                    value={step.approver_role_id}
                    onChange={(e) => setRole(idx, e.target.value)}
                  />
                </div>
                <div className="flex shrink-0 items-center">
                  <IconButton label={`Move approver ${step.step_order} up`} onClick={() => moveStep(idx, -1)} disabled={idx === 0 || isPending}>
                    <ArrowUp className="h-4 w-4" />
                  </IconButton>
                  <IconButton
                    label={`Move approver ${step.step_order} down`}
                    onClick={() => moveStep(idx, 1)}
                    disabled={idx === steps.length - 1 || isPending}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </IconButton>
                  <IconButton label={`Remove approver ${step.step_order}`} onClick={() => removeStep(idx)} disabled={steps.length <= 1 || isPending}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              </li>
            ))}
          </ol>
          <p className="pt-2 text-meta text-muted">“Manager” means the requester’s own manager; the other roles share one queue.</p>
        </section>
      </form>
    </Dialog>
  )
}
