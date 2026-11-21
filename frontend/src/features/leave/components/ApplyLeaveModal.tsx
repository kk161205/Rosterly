import React, { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Dialog, SelectField, TextAreaField, TextField } from '@/ui'
import { useHolidays, useLeaveTypes } from '@/features/leave/hooks/useLeave'
import { workingDays } from '@/features/leave/lib/workingDays'
import type { LeaveBalanceItem, LeaveRequestCreate } from '@/features/leave/types/leave'
import { getErrorMessage, getFieldErrors } from '@/lib/errors'

interface ApplyLeaveModalProps {
  open: boolean
  onClose: () => void
  onApply: (data: LeaveRequestCreate) => Promise<void>
  balances: LeaveBalanceItem[]
  isPending?: boolean
}

/** Ask for time off. It goes to your manager, or HR if you have none. */
export const ApplyLeaveModal: React.FC<ApplyLeaveModalProps> = ({ open, onClose, onApply, balances, isPending }) => {
  const types = useLeaveTypes()
  const [typeId, setTypeId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const year = startDate ? Number(startDate.slice(0, 4)) : new Date().getFullYear()
  const holidays = useHolidays(year)

  useEffect(() => {
    if (!open) return
    setTypeId('')
    setStartDate('')
    setEndDate('')
    setReason('')
    setError(null)
    setFieldErrors({})
  }, [open])

  const count = useMemo(
    () => workingDays(startDate, endDate, (holidays.data ?? []).map((h) => h.date)),
    [startDate, endDate, holidays.data],
  )
  const balance = balances.find((b) => b.leave_type.id === typeId)
  const left = balance && balance.balance_days !== null ? Number(balance.balance_days) - Number(balance.pending_days) : null
  const tooMany = left !== null && count > left

  const submit = async () => {
    setError(null)
    setFieldErrors({})
    try {
      await onApply({ leave_type_id: typeId, start_date: startDate, end_date: endDate, reason: reason.trim() || null })
      onClose()
    } catch (err) {
      setError(getErrorMessage(err, 'Your request could not be sent.'))
      setFieldErrors(getFieldErrors(err))
    }
  }

  const ready = typeId && startDate && endDate && startDate <= endDate && count > 0 && !tooMany

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Ask for leave"
      description="It goes to your manager, or to HR if you don’t have one."
      busy={isPending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button data-guide="leave.send" variant="primary" onClick={submit} isLoading={isPending} disabled={!ready}>
            Send request
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {error && <Alert>{error}</Alert>}
        <SelectField
          label="Type of leave"
          placeholder="Choose…"
          options={(types.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
          value={typeId}
          onChange={(e) => setTypeId(e.target.value)}
          error={fieldErrors.leave_type_id}
          hint={left !== null ? `${left} day${left === 1 ? '' : 's'} left after your other pending requests.` : balance ? 'No limit.' : undefined}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField label="First day" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} error={fieldErrors.start_date} />
          <TextField label="Last day" type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} error={fieldErrors.end_date} />
        </div>
        {startDate && endDate && (
          <p className={tooMany ? 'text-body text-status-bad' : 'text-body text-ink'} aria-live="polite">
            {startDate > endDate
              ? 'The last day is before the first day.'
              : count === 0
                ? 'Those dates are all weekends or holidays.'
                : `${count} working day${count === 1 ? '' : 's'} (weekends and holidays not counted)${tooMany ? ' — more than you have left.' : '.'}`}
          </p>
        )}
        <TextAreaField label="Note for your approver (optional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} />
      </div>
    </Dialog>
  )
}
