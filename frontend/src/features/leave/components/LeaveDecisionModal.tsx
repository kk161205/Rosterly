import React, { useEffect, useState } from 'react'
import { Alert, Button, DetailRow, Dialog, TextAreaField } from '@/ui'
import { formatDate } from '@/lib/format'
import type { LeaveRequestResponse } from '@/features/leave/types/leave'
import { getErrorMessage } from '@/lib/errors'

interface LeaveDecisionModalProps {
  open: boolean
  onClose: () => void
  leave: LeaveRequestResponse | null
  action: 'approve' | 'reject'
  onConfirm: (payload: { id: string; action: 'approve' | 'reject'; comments?: string }) => Promise<void>
  isPending?: boolean
}

const days = (n: number | string) => `${n} working ${Number(n) === 1 ? 'day' : 'days'}`

/** Approve or reject one leave request; rejecting needs a reason the person will see. */
export const LeaveDecisionModal: React.FC<LeaveDecisionModalProps> = ({ open, onClose, leave, action, onConfirm, isPending }) => {
  const [comments, setComments] = useState('')
  const [error, setError] = useState<string | null>(null)
  const isReject = action === 'reject'

  useEffect(() => {
    if (!open) return
    setComments('')
    setError(null)
  }, [open])

  if (!leave) return null
  const name = leave.employee_name || 'this person'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isReject && !comments.trim()) return setError(`Say why, so ${name} knows what to change.`)
    try {
      setError(null)
      await onConfirm({ id: leave.id, action, comments: comments.trim() || undefined })
      onClose()
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'That didn’t go through. Try again.'))
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={isReject ? `Reject ${name}’s leave?` : `Approve ${name}’s leave?`}
      description={isReject ? `${name} is told, with your reason.` : `${name} is told, and the days come off their balance.`}
      busy={isPending}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button variant={isReject ? 'danger' : 'primary'} onClick={handleSubmit} disabled={isPending}>
            {isReject ? 'Reject' : 'Approve'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-1">
        {error && <Alert tone="error">{error}</Alert>}
        <div>
          <DetailRow label="Type">{leave.leave_type.name}</DetailRow>
          <DetailRow label="Dates">
            {formatDate(leave.start_date)} – {formatDate(leave.end_date)} · {days(leave.total_days)}
          </DetailRow>
          {leave.reason && <DetailRow label="Their note">{leave.reason}</DetailRow>}
        </div>
        <TextAreaField
          label={isReject ? 'Reason' : 'Note (optional)'}
          placeholder={isReject ? 'e.g. Release week — could you move it to the week after?' : 'Anything they should know'}
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          required={isReject}
        />
      </form>
    </Dialog>
  )
}
