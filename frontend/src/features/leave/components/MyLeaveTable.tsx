import React, { useState } from 'react'
import { Table, THead, Th, Tr, Td, RowButton, Pagination, Status, EmptyState } from '@/ui'
import { LeaveNoteDrawer } from '@/features/leave/components/LeaveNoteDrawer'
import type { LeaveRequestResponse } from '@/features/leave/types/leave'

interface MyLeaveTableProps {
  items: LeaveRequestResponse[]
  total: number
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  onApplyClick?: () => void
}

export const MyLeaveTable: React.FC<MyLeaveTableProps> = ({
  items,
  total,
  page,
  pageSize,
  onPageChange,
  onApplyClick,
}) => {
  const [selectedLeave, setSelectedLeave] = useState<LeaveRequestResponse | null>(null)

  if (items.length === 0) {
    return (
      <EmptyState
        title="No leave requests submitted yet"
        description="Apply for time off, vacation days, or report sick leave."
        action={
          onApplyClick && (
            <button
              type="button"
              onClick={onApplyClick}
              className="rounded-pill bg-navy px-4 py-2 text-body font-medium text-paper hover:bg-navy-hover"
            >
              Apply for Leave
            </button>
          )
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Table label="My leave requests history">
        <THead>
          <Th>Date Range</Th>
          <Th>Leave Type</Th>
          <Th>Total Days</Th>
          <Th>Status</Th>
          <Th>Approver Note</Th>
        </THead>
        <tbody>
          {items.map((leave) => {
            const startStr = new Date(leave.start_date).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
            })
            const endStr = new Date(leave.end_date).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })

            return (
              <Tr
                key={leave.id}
                onClick={() => setSelectedLeave(leave)}
                selected={selectedLeave?.id === leave.id}
                className="cursor-pointer hover:bg-row-hover"
              >
                <Td>
                  <RowButton
                    label={`View details for ${leave.leave_type} leave from ${startStr} to ${endStr}`}
                    onClick={() => setSelectedLeave(leave)}
                  >
                    <span className="font-medium text-ink">
                      {startStr} – {endStr}
                    </span>
                    <span className="text-micro text-muted">
                      Applied {new Date(leave.created_at).toLocaleDateString('en-IN')}
                    </span>
                  </RowButton>
                </Td>
                <Td className="capitalize text-ink">{leave.leave_type}</Td>
                <Td className="font-mono text-ink">
                  {leave.total_days} {leave.total_days === 1 ? 'day' : 'days'}
                </Td>
                <Td>
                  <Status value={leave.status} />
                </Td>
                <Td className="max-w-xs truncate text-meta text-muted">
                  {leave.decision_comments || (
                    <span className="italic text-muted">No note</span>
                  )}
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

      <LeaveNoteDrawer
        leave={selectedLeave}
        onClose={() => setSelectedLeave(null)}
      />
    </div>
  )
}
