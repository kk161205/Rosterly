import React, { useState } from 'react'
import { Check, X } from 'lucide-react'
import { Table, THead, Th, Tr, Td, Button, Pagination, EmptyState } from '@/ui'
import { LeaveDecisionModal } from '@/features/leave/components/LeaveDecisionModal'
import type { LeaveDecision, LeaveRejection, LeaveRequestResponse } from '@/features/leave/types/leave'
import { formatDate, formatShortDate } from '@/lib/format'

interface PendingLeaveTableProps {
  items: LeaveRequestResponse[]
  total: number
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  onApprove: (id: string, decision?: LeaveDecision) => Promise<void>
  onReject: (id: string, rejection: LeaveRejection) => Promise<void>
  isPending?: boolean
}

export const PendingLeaveTable: React.FC<PendingLeaveTableProps> = ({
  items,
  total,
  page,
  pageSize,
  onPageChange,
  onApprove,
  onReject,
  isPending,
}) => {
  const [activeItem, setActiveItem] = useState<{
    leave: LeaveRequestResponse
    action: 'approve' | 'reject'
  } | null>(null)

  const handleConfirmDecision = async ({
    id,
    action,
    comments,
  }: {
    id: string
    action: 'approve' | 'reject'
    comments?: string
  }) => {
    if (action === 'approve') {
      await onApprove(id, comments ? { comments } : undefined)
    } else {
      await onReject(id, { comments: comments || '' })
    }
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="Nothing to decide"
        description="Leave your team asks for will appear here for you to approve."
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Table label="Pending team leave requests">
        <THead>
          <Th>Employee</Th>
          <Th>Leave Type</Th>
          <Th>Duration</Th>
          <Th>Reason</Th>
          <Th className="text-right">Decisions</Th>
        </THead>
        <tbody>
          {items.map((leave) => {
            const startStr = formatShortDate(leave.start_date)
            const endStr = formatDate(leave.end_date)

            return (
              <Tr key={leave.id}>
                <Td>
                  <div className="flex flex-col">
                    <span className="font-medium text-ink">{leave.employee_name || 'Employee'}</span>
                    <span className="text-micro text-muted">{leave.employee_email}</span>
                  </div>
                </Td>
                <Td className="text-ink">{leave.leave_type.name}</Td>
                <Td>
                  <div className="flex flex-col">
                    <span className="font-medium text-ink">
                      {startStr} – {endStr}
                    </span>
                    <span className="font-mono text-micro text-muted">
                      {leave.total_days} business {leave.total_days === 1 ? 'day' : 'days'}
                    </span>
                  </div>
                </Td>
                <Td className="max-w-xs truncate text-meta text-muted">
                  {leave.reason || <span className="italic text-muted">None</span>}
                </Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setActiveItem({ leave, action: 'approve' })}
                      disabled={isPending}
                    >
                      <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                      Approve
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setActiveItem({ leave, action: 'reject' })}
                      disabled={isPending}
                    >
                      <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                      Reject
                    </Button>
                  </div>
                </Td>
              </Tr>
            )
          })}
        </tbody>
      </Table>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPage={onPageChange}
      />

      {activeItem && (
        <LeaveDecisionModal
          open={Boolean(activeItem)}
          onClose={() => setActiveItem(null)}
          leave={activeItem.leave}
          action={activeItem.action}
          onConfirm={handleConfirmDecision}
          isPending={isPending}
        />
      )}
    </div>
  )
}
