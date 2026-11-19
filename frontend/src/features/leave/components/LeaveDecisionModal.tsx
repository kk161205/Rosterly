import React, { useState, useEffect } from 'react'
import { Dialog, Button, TextAreaField, Alert } from '@/ui'
import type { LeaveRequestResponse } from '@/features/leave/types/leave'

interface LeaveDecisionModalProps {
  open: boolean
  onClose: () => void
  leave: LeaveRequestResponse | null
  action: 'approve' | 'reject'
  onConfirm: (payload: { id: string; action: 'approve' | 'reject'; comments?: string }) => Promise<void>
  isPending?: boolean
}

export const LeaveDecisionModal: React.FC<LeaveDecisionModalProps> = ({
  open,
  onClose,
  leave,
  action,
  onConfirm,
  isPending,
}) => {
  const [comments, setComments] = useState('')
  const [error, setError] = useState<string | null>(null)

  const isReject = action === 'reject'

  useEffect(() => {
    if (!open) return
    setComments('')
    setError(null)
  }, [open])

  if (!leave) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isReject && !comments.trim()) {
      setError('A comment explaining the rejection reason is required.')
      return
    }

    try {
      setError(null)
      await onConfirm({
        id: leave.id,
        action,
        comments: comments.trim() || undefined,
      })
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Failed to ${action} leave request.`)
    }
  }

  const employeeName = leave.employee_name || 'the employee'

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={isReject ? `Reject Leave for ${employeeName}` : `Approve Leave for ${employeeName}`}
      description={
        isReject
          ? 'Provide justification for rejecting this time-off request. The employee will receive notification.'
          : 'Confirm approval for this leave request. Attendance records will be marked as on_leave.'
      }
      busy={isPending}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant={isReject ? 'danger' : 'primary'}
            onClick={handleSubmit}
            disabled={isPending}
          >
            {isReject ? 'Reject Request' : 'Approve Request'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
        {error && <Alert tone="error">{error}</Alert>}

        <div className="rounded-card border border-line bg-ground/50 p-3 text-body">
          <div className="flex items-center justify-between">
            <span className="font-medium text-ink capitalize">{leave.leave_type} Leave</span>
            <span className="font-mono text-meta font-semibold text-navy">
              {leave.total_days} business days
            </span>
          </div>
          <div className="mt-1 text-meta text-muted">
            {new Date(leave.start_date).toLocaleDateString('en-IN')} –{' '}
            {new Date(leave.end_date).toLocaleDateString('en-IN')}
          </div>
          {leave.reason && (
            <p className="mt-2 text-micro text-ink">
              <span className="font-semibold text-muted">Reason: </span>
              {leave.reason}
            </p>
          )}
        </div>

        <TextAreaField
          label={isReject ? 'Rejection Reason (Required)' : 'Comments (Optional)'}
          placeholder={
            isReject
              ? 'Explain why this leave cannot be granted (e.g. critical project milestone)'
              : 'Add any notes for the employee'
          }
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          required={isReject}
        />
      </form>
    </Dialog>
  )
}
