import React, { useState, useEffect } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Dialog, Button, TextField, SelectField, Alert } from '@/ui'
import { useAssignableRoles } from '@/features/approvalChains/hooks/useApprovalChains'
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

const REQUEST_TYPE_OPTIONS = [
  { value: 'asset_request', label: 'Asset Request' },
  { value: 'access_request', label: 'Access Request' },
  { value: 'it_ticket', label: 'IT Ticket' },
  { value: 'other', label: 'General / Other Request' },
]

export const ChainTemplateModal: React.FC<ChainTemplateModalProps> = ({
  open,
  onClose,
  template,
  onSave,
  isPending,
}) => {
  const isEdit = Boolean(template)
  const { data: rolesData } = useAssignableRoles()
  const roles = rolesData || []

  const [requestType, setRequestType] = useState<ChainRequestType>('asset_request')
  const [name, setName] = useState('')
  const [minAmount, setMinAmount] = useState<string>('')
  const [isActive, setIsActive] = useState(true)
  const [steps, setSteps] = useState<ChainStepInput[]>([])
  const [error, setError] = useState<string | null>(null)

  const roleOptions = roles.map((r) => ({
    value: r.id,
    label: r.name.replace(/_/g, ' ').toUpperCase(),
  }))

  useEffect(() => {
    if (!open) return
    if (template) {
      setRequestType(template.request_type)
      setName(template.name)
      setMinAmount(template.min_amount != null ? String(template.min_amount) : '')
      setIsActive(template.is_active)
      setSteps(
        template.steps.map((s) => ({
          step_order: s.step_order,
          approver_role_id: s.approver_role_id,
        })),
      )
    } else {
      setRequestType('asset_request')
      setName('')
      setMinAmount('')
      setIsActive(true)
      setSteps(roles.length > 0 ? [{ step_order: 1, approver_role_id: roles[0].id }] : [])
    }
    setError(null)
  }, [template, open])

  const addStep = () => {
    if (roles.length === 0) return
    setSteps((prev) => [
      ...prev,
      { step_order: prev.length + 1, approver_role_id: roles[0].id },
    ])
  }

  const removeStep = (index: number) => {
    setSteps((prev) => {
      const next = prev.filter((_, i) => i !== index)
      return next.map((s, idx) => ({ ...s, step_order: idx + 1 }))
    })
  }

  const moveStep = (index: number, direction: 'up' | 'down') => {
    setSteps((prev) => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1
      if (targetIndex < 0 || targetIndex >= prev.length) return prev
      const copy = [...prev]
      const temp = copy[index]
      copy[index] = copy[targetIndex]
      copy[targetIndex] = temp
      return copy.map((s, idx) => ({ ...s, step_order: idx + 1 }))
    })
  }

  const handleRoleChange = (index: number, roleId: string) => {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, approver_role_id: roleId } : s)),
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Please provide a name for this approval chain template.')
      return
    }
    if (steps.length === 0) {
      setError('At least one approval step is required.')
      return
    }

    const parsedMin = minAmount.trim() ? parseFloat(minAmount) : null

    try {
      if (isEdit && template) {
        await onSave({
          isEdit: true,
          id: template.id,
          updateData: {
            name: name.trim(),
            min_amount: parsedMin,
            is_active: isActive,
            steps,
          },
        })
      } else {
        await onSave({
          isEdit: false,
          createData: {
            request_type: requestType,
            name: name.trim(),
            min_amount: parsedMin,
            steps,
          },
        })
      }
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save approval chain template.')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={isEdit ? 'Edit Approval Chain' : 'New Approval Chain'}
      description="Configure multi-step routing rules and cost threshold conditions."
      busy={isPending}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={isPending}>
            {isEdit ? 'Save Changes' : 'Create Chain'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 pt-2">
        {error && <Alert tone="error">{error}</Alert>}

        {!isEdit && (
          <SelectField
            label="Request Type"
            options={REQUEST_TYPE_OPTIONS}
            value={requestType}
            onChange={(e) => setRequestType(e.target.value as ChainRequestType)}
          />
        )}

        <TextField
          label="Template Name"
          placeholder="e.g. Standard Hardware Chain or High-Value Procurement"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <TextField
          label="Cost Threshold (₹ INR) — Optional"
          type="number"
          placeholder="e.g. 50000 (Applies only when request amount is above threshold)"
          value={minAmount}
          onChange={(e) => setMinAmount(e.target.value)}
          hint="Leave empty if this template applies to all requests regardless of cost."
        />

        {isEdit && (
          <label className="flex cursor-pointer items-center gap-2.5 pt-1 text-body">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded text-navy focus:ring-navy"
            />
            <span className="font-medium text-ink">Active template</span>
          </label>
        )}

        {/* Steps Editor */}
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <div className="flex items-center justify-between">
            <h4 className="text-body font-semibold text-ink">Approval Steps Hierarchy</h4>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={addStep}
              disabled={isPending}
            >
              <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Add Step
            </Button>
          </div>

          <div className="flex flex-col gap-2.5">
            {steps.map((step, idx) => (
              <div
                key={step.step_order}
                className="flex items-center gap-3 rounded-card border border-line bg-ground/50 p-3"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-navy text-micro font-semibold text-paper">
                  {step.step_order}
                </span>

                <div className="flex-1">
                  <SelectField
                    label={`Step ${step.step_order} Role`}
                    hideLabel
                    options={roleOptions}
                    value={step.approver_role_id}
                    onChange={(e) => handleRoleChange(idx, e.target.value)}
                  />
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveStep(idx, 'up')}
                    disabled={idx === 0 || isPending}
                    aria-label="Move step up"
                    className="rounded p-1 text-muted hover:bg-paper hover:text-ink disabled:opacity-30"
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveStep(idx, 'down')}
                    disabled={idx === steps.length - 1 || isPending}
                    aria-label="Move step down"
                    className="rounded p-1 text-muted hover:bg-paper hover:text-ink disabled:opacity-30"
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeStep(idx)}
                    disabled={steps.length <= 1 || isPending}
                    aria-label="Remove step"
                    className="rounded p-1 text-status-bad hover:bg-bad-tint disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </form>
    </Dialog>
  )
}
