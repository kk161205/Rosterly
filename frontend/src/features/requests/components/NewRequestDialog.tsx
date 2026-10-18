import React, { useEffect, useState } from 'react'
import { requestService } from '@/features/requests/services/requestService'
import type { RequestDetail, RequestPriority, RequestType } from '@/features/requests/types/requests'
import { getErrorCode, getErrorMessage, getFieldErrors } from '@/lib/errors'
import { Alert, Button, Dialog, SelectField, TextAreaField, TextField, cn } from '@/ui'

const TYPES: { value: RequestType; label: string; hint: string; costLabel?: string }[] = [
  { value: 'asset_request', label: 'Equipment', hint: 'A laptop, monitor, phone or accessory', costLabel: 'Estimated cost (₹)' },
  { value: 'access_request', label: 'Access', hint: 'A system, tool, folder or licence', costLabel: 'Cost per month, if any (₹)' },
  { value: 'it_ticket', label: 'IT help', hint: 'Something isn’t working and needs IT' },
  { value: 'other', label: 'Something else', hint: 'Anything that needs an approval' },
]

const PRIORITIES: { value: RequestPriority; label: string }[] = [
  { value: 'low', label: 'Low — whenever possible' },
  { value: 'medium', label: 'Medium — this week' },
  { value: 'high', label: 'High — blocking my work' },
]

/** New request (POST /requests, §5.11). The approval chain is chosen by the server from type and cost. */
export const NewRequestDialog: React.FC<{
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (request: RequestDetail) => void
}> = ({ open, onOpenChange, onCreated }) => {
  const [type, setType] = useState<RequestType>('asset_request')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [cost, setCost] = useState('')
  const [priority, setPriority] = useState<RequestPriority>('medium')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setType('asset_request')
    setTitle('')
    setDescription('')
    setCost('')
    setPriority('medium')
    setErrors({})
    setError(null)
  }, [open])

  const current = TYPES.find((t) => t.value === type)!

  const submit = async () => {
    const v: Record<string, string> = {}
    if (!title.trim()) v.title = 'Give the request a short title.'
    if (!description.trim()) v.description = 'Say what you need and why.'
    if (cost !== '' && Number(cost) < 0) v.estimated_cost = 'Enter ₹0 or more.'
    setErrors(v)
    if (Object.keys(v).length) return
    setBusy(true)
    setError(null)
    try {
      const created = await requestService.create({
        request_type: type,
        title: title.trim(),
        description: description.trim(),
        priority,
        ...(current.costLabel && cost !== '' ? { estimated_cost: Number(cost) } : {}),
      })
      onCreated(created)
    } catch (err) {
      setError(
        getErrorCode(err) === 'no_approval_chain'
          ? 'There’s no approval route set up for this kind of request yet. Ask an administrator to add one.'
          : getErrorMessage(err),
      )
      setErrors(getFieldErrors(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New request"
      description="It goes to the right approvers automatically, based on what you ask for."
      className="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" isLoading={busy} onClick={submit}>
            Submit request
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {error && <Alert>{error}</Alert>}
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1.5 text-body font-medium text-ink">What do you need?</legend>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Request type">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={type === t.value}
                onClick={() => setType(t.value)}
                className={cn(
                  'flex flex-col items-start gap-0.5 rounded-card border px-3.5 py-3 text-left transition-colors',
                  type === t.value ? 'border-navy bg-navy-tint' : 'border-line hover:border-control',
                )}
              >
                <span className="text-body font-medium text-ink">{t.label}</span>
                <span className="text-meta text-muted">{t.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} maxLength={255} />
        <TextAreaField
          label="Details"
          hint="What you need, why, and by when. Approvers read this first."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={errors.description}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          {current.costLabel && (
            <TextField
              label={current.costLabel}
              type="number"
              inputMode="decimal"
              min={0}
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              error={errors.estimated_cost}
              hint="Higher-cost requests may need one more approval."
            />
          )}
          <SelectField
            label="Priority"
            options={PRIORITIES}
            value={priority}
            onChange={(e) => setPriority(e.target.value as RequestPriority)}
          />
        </div>
      </div>
    </Dialog>
  )
}
