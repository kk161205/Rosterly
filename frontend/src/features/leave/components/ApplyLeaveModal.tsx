import React, { useState, useEffect } from 'react'
import { Calendar, UserCheck } from 'lucide-react'
import { Dialog, Button, SelectField, TextField, TextAreaField, Alert } from '@/ui'
import { calculateBusinessDays } from '@/features/leave/lib/businessDays'
import type { LeaveBalanceItem, LeaveRequestCreate, LeaveType } from '@/features/leave/types/leave'

interface ApplyLeaveModalProps {
  open: boolean
  onClose: () => void
  onApply: (data: LeaveRequestCreate) => Promise<void>
  balances: LeaveBalanceItem[]
  isPending?: boolean
}

const LEAVE_TYPE_OPTIONS = [
  { value: 'sick', label: 'Sick Leave' },
  { value: 'casual', label: 'Casual Leave' },
  { value: 'earned', label: 'Earned Leave' },
  { value: 'unpaid', label: 'Unpaid Leave' },
  { value: 'other', label: 'Other Special Leave' },
]

export const ApplyLeaveModal: React.FC<ApplyLeaveModalProps> = ({
  open,
  onClose,
  onApply,
  balances,
  isPending,
}) => {
  const [leaveType, setLeaveType] = useState<LeaveType>('casual')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLeaveType('casual')
    setStartDate('')
    setEndDate('')
    setReason('')
    setError(null)
  }, [open])

  const businessDays = calculateBusinessDays(startDate, endDate)

  const selectedBalance = balances.find((b) => b.leave_type === leaveType)
  const remainingDays = selectedBalance ? Number(selectedBalance.balance_days) : 0

  const hasInsufficientBalance = leaveType !== 'unpaid' && businessDays > remainingDays

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!startDate || !endDate) {
      setError('Please select both start and end dates.')
      return
    }
    if (new Date(startDate) > new Date(endDate)) {
      setError('End date cannot precede start date.')
      return
    }
    if (businessDays <= 0) {
      setError('Selected date range contains no working business days.')
      return
    }
    if (hasInsufficientBalance) {
      setError(
        `Insufficient balance. You have ${remainingDays} days remaining for ${leaveType.toUpperCase()}, but requested ${businessDays} days.`,
      )
      return
    }

    try {
      setError(null)
      await onApply({
        leave_type: leaveType,
        start_date: startDate,
        end_date: endDate,
        reason: reason.trim() || null,
      })
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not submit leave application.')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Apply for Leave"
      description="Submit a new time-off request with dynamic business day calculation."
      busy={isPending}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={isPending || hasInsufficientBalance}>
            Submit Leave Request
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
        {error && <Alert tone="error">{error}</Alert>}

        <SelectField
          label="Leave Type"
          options={LEAVE_TYPE_OPTIONS}
          value={leaveType}
          onChange={(e) => setLeaveType(e.target.value as LeaveType)}
          hint={`Available quota balance: ${remainingDays} days remaining this year.`}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Start Date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />

          <TextField
            label="End Date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            required
          />
        </div>

        {startDate && endDate && (
          <div className="flex items-center justify-between rounded-card border border-line bg-ground/50 px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted" aria-hidden="true" />
              <span className="text-body font-medium text-ink">Total Duration</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-body font-semibold text-navy">
                {businessDays} {businessDays === 1 ? 'business day' : 'business days'}
              </span>
              {hasInsufficientBalance && (
                <span className="text-micro font-medium text-status-bad">(Exceeds balance)</span>
              )}
            </div>
          </div>
        )}

        <TextAreaField
          label="Reason for Leave"
          placeholder="Briefly state reason for leave request (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />

        {/* Live approval routing preview */}
        <div className="flex items-start gap-2.5 rounded bg-navy-tint/40 p-3 text-meta text-ink">
          <UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-navy" aria-hidden="true" />
          <div className="flex flex-col">
            <span className="font-medium">Approval Routing Path</span>
            <span className="text-micro text-muted">
              Auto-routes to your assigned Department Manager for decision, updating attendance records on approval.
            </span>
          </div>
        </div>
      </form>
    </Dialog>
  )
}
