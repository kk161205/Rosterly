import React, { useState } from 'react'
import { Alert, Button, Table, THead, Th, Tr, Td, RowButton, Pagination, Status, EmptyState } from '@/ui'
import { LeaveNoteDrawer } from '@/features/leave/components/LeaveNoteDrawer'
import type { LeaveRequestResponse } from '@/features/leave/types/leave'
import { formatDate, formatShortDate } from '@/lib/format'
import { getErrorMessage } from '@/lib/errors'

interface MyLeaveTableProps {
  items: LeaveRequestResponse[]
  total: number
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  onApplyClick?: () => void
  onCancel?: (id: string) => Promise<void>
}

export const MyLeaveTable: React.FC<MyLeaveTableProps> = ({
  items,
  total,
  page,
  pageSize,
  onPageChange,
  onApplyClick,
  onCancel,
}) => {
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [selectedLeave, setSelectedLeave] = useState<LeaveRequestResponse | null>(null)

  if (items.length === 0) {
    return (
      <EmptyState
        title="No leave yet"
        description="Your requests and their status will show here."
        action={
          onApplyClick && (
            <Button variant="primary" onClick={onApplyClick}>
              Ask for leave
            </Button>
          )
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {cancelError && <Alert>{cancelError}</Alert>}
      <Table label="My leave requests history">
        <THead>
          <Th>Dates</Th>
          <Th>Type</Th>
          <Th>Days</Th>
          <Th>Status</Th>
          <Th>Approver note</Th>
          {onCancel && <Th srOnly>Actions</Th>}
        </THead>
        <tbody>
          {items.map((leave) => {
            const startStr = formatShortDate(leave.start_date)
            const endStr = formatDate(leave.end_date)

            return (
              <Tr
                key={leave.id}
                onClick={() => setSelectedLeave(leave)}
                selected={selectedLeave?.id === leave.id}
                className="cursor-pointer hover:bg-row-hover"
              >
                <Td>
                  <RowButton
                    label={`View details for ${leave.leave_type.name} from ${startStr} to ${endStr}`}
                    onClick={() => setSelectedLeave(leave)}
                  >
                    <span className="font-medium text-ink">
                      {startStr} – {endStr}
                    </span>
                    <span className="text-micro text-muted">
                      Applied {formatDate(leave.created_at)}
                    </span>
                  </RowButton>
                </Td>
                <Td className="text-ink">{leave.leave_type.name}</Td>
                <Td className="font-mono text-ink">
                  {leave.total_days} {leave.total_days === 1 ? 'day' : 'days'}
                </Td>
                <Td>
                  <Status value={leave.status} />
                </Td>
                <Td className="max-w-xs truncate text-meta text-muted">
                  {leave.decision_comments || <span className="text-muted">No note</span>}
                </Td>
                {onCancel && (
                  <Td className="text-right">
                    {leave.can_cancel && (
                      <Button
                        variant="ghost"
                        size="sm"
                        isLoading={cancelling === leave.id}
                        onClick={async (e) => {
                          e.stopPropagation()
                          setCancelling(leave.id)
                          try {
                            await onCancel(leave.id)
                          } catch (err) {
                            setCancelError(getErrorMessage(err, 'That leave couldn’t be cancelled. Try again.'))
                          } finally {
                            setCancelling(null)
                          }
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                  </Td>
                )}
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
