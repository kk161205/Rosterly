import React, { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { lifecycleService } from '@/features/lifecycle/services/lifecycleService'
import type { Checklist } from '@/features/lifecycle/types/checklist'
import { getErrorMessage, getFieldErrors } from '@/lib/errors'
import { Alert, Button, Dialog, TextAreaField, TextField } from '@/ui'

/**
 * "Are you sure?" before starting an offboarding (POST /offboarding, §5.6).
 * It marks the person as leaving and lists their devices for IT, so it asks
 * first; while the request runs the dialog is locked (no closing, no edits,
 * no double submit).
 */
export const StartOffboardingDialog: React.FC<{
  person: { id: string; full_name: string } | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onStarted?: (checklist: Checklist) => void
}> = ({ person, open, onOpenChange, onStarted }) => {
  const queryClient = useQueryClient()
  const [exitDate, setExitDate] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setExitDate('')
    setReason('')
    setError(null)
    setFieldErrors({})
  }, [open])

  if (!person) return null
  const first = person.full_name.split(' ')[0]

  const start = async () => {
    setBusy(true)
    setError(null)
    setFieldErrors({})
    try {
      const checklist = await lifecycleService.startOffboarding({
        employee_id: person.id,
        exit_date: exitDate || undefined,
        reason: reason.trim() || undefined,
      })
      // Everything that shows this person or their tasks changes
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lifecycle'] }),
        queryClient.invalidateQueries({ queryKey: ['employees'] }),
        queryClient.invalidateQueries({ queryKey: ['profile'] }),
        queryClient.invalidateQueries({ queryKey: ['inbox'] }),
      ])
      setBusy(false)
      onOpenChange(false)
      onStarted?.(checklist)
    } catch (err) {
      setError(getErrorMessage(err))
      setFieldErrors(getFieldErrors(err))
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      title={`Offboard ${person.full_name}?`}
      description="Please confirm before continuing."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            No, keep {first}
          </Button>
          <Button variant="danger" isLoading={busy} onClick={start}>
            {busy ? 'Starting offboarding…' : 'Yes, start offboarding'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {error && <Alert>{error}</Alert>}
        <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-body text-ink marker:text-control">
          <li>{first} is marked as leaving.</li>
          <li>Every device {first} holds is listed for IT to collect.</li>
          <li>HR, IT and the manager each get their exit tasks.</li>
          <li>The account is only closed later, when every task is done and HR completes it.</li>
        </ul>
        <TextField
          label="Last day (optional)"
          type="date"
          value={exitDate}
          onChange={(e) => setExitDate(e.target.value)}
          error={fieldErrors.exit_date}
        />
        <TextAreaField
          label="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={fieldErrors.reason}
        />
      </div>
    </Dialog>
  )
}
