import React from 'react'
import { SidePanel, DetailRow, Status, Button } from '@/ui'
import type { LeaveRequestResponse } from '@/features/leave/types/leave'

interface LeaveNoteDrawerProps {
  leave: LeaveRequestResponse | null
  onClose: () => void
}

export const LeaveNoteDrawer: React.FC<LeaveNoteDrawerProps> = ({ leave, onClose }) => {
  if (!leave) return null

  const startFormatted = new Date(leave.start_date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const endFormatted = new Date(leave.end_date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  return (
    <SidePanel
      open={Boolean(leave)}
      onOpenChange={(open) => !open && onClose()}
      title="Leave Request Details"
      description={`Submission record for ${leave.leave_type.toUpperCase()} leave.`}
      footer={
        <div className="flex w-full items-center justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <section className="flex flex-col rounded-card border border-line bg-ground/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-semibold capitalize text-ink">
              {leave.leave_type} Leave
            </span>
            <Status value={leave.status} />
          </div>
          <DetailRow label="Date duration">
            {startFormatted} – {endFormatted}
          </DetailRow>
          <DetailRow label="Working days count">
            <span className="font-mono font-medium text-navy">{leave.total_days} business days</span>
          </DetailRow>
          <DetailRow label="Submission date">
            {new Date(leave.created_at).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </DetailRow>
        </section>

        {/* Requester reason */}
        <section className="flex flex-col gap-2">
          <h4 className="text-body font-semibold text-ink">Reason for Request</h4>
          <p className="rounded-card border border-line bg-paper p-3 text-body text-ink">
            {leave.reason || <span className="italic text-muted">No comment provided.</span>}
          </p>
        </section>

        {/* Approver decision note */}
        <section className="flex flex-col gap-2">
          <h4 className="text-body font-semibold text-ink">Approver Decision & Comments</h4>
          <div className="flex flex-col gap-2 rounded-card border border-line bg-paper p-3 text-body">
            <div className="flex items-center justify-between text-meta text-muted">
              <span>Decision Actor: {leave.approver_name || 'Pending Review'}</span>
              <span>Updated: {new Date(leave.updated_at).toLocaleDateString('en-IN')}</span>
            </div>
            <p className="mt-1 text-ink">
              {leave.decision_comments || (
                <span className="italic text-muted">No approver comments recorded.</span>
              )}
            </p>
          </div>
        </section>
      </div>
    </SidePanel>
  )
}
