import React from 'react'
import { Button, DetailRow, SidePanel, Status } from '@/ui'
import { formatDate } from '@/lib/format'
import type { LeaveRequestResponse } from '@/features/leave/types/leave'

/** One of your leave requests: dates, your note, and the decision with its note. */
export const LeaveNoteDrawer: React.FC<{ leave: LeaveRequestResponse | null; onClose: () => void }> = ({ leave, onClose }) => {
  if (!leave) return null
  const decided = leave.status === 'approved' || leave.status === 'rejected'

  return (
    <SidePanel
      open
      onOpenChange={(open) => !open && onClose()}
      title={leave.leave_type.name}
      description={`${formatDate(leave.start_date)} – ${formatDate(leave.end_date)}`}
      footer={
        <div className="flex w-full justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-8">
        <section>
          <DetailRow label="Status">
            <Status value={leave.status} />
          </DetailRow>
          <DetailRow label="Working days">{leave.total_days}</DetailRow>
          <DetailRow label="Asked on">{formatDate(leave.created_at)}</DetailRow>
          <DetailRow label="Your note">{leave.reason || <span className="text-muted">None</span>}</DetailRow>
        </section>

        <section aria-labelledby="leave-decision">
          <h3 id="leave-decision" className="border-b border-ink pb-2 text-section text-ink">
            Decision
          </h3>
          {decided ? (
            <>
              <DetailRow label="By">{leave.approver_name || '—'}</DetailRow>
              <DetailRow label="On">{formatDate(leave.updated_at)}</DetailRow>
              <DetailRow label="Note">{leave.decision_comments || <span className="text-muted">None</span>}</DetailRow>
            </>
          ) : (
            <p className="pt-3 text-body text-muted">
              {leave.status === 'cancelled' ? 'You cancelled this request.' : `Waiting for ${leave.approver_name || 'a decision'}.`}
            </p>
          )}
        </section>
      </div>
    </SidePanel>
  )
}
