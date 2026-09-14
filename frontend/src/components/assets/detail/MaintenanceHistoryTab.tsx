import React from 'react'
import { Wrench, Plus, CheckCircle2, Clock, AlertTriangle, CheckCheck } from 'lucide-react'
import { Card, Button, StatusBadge } from '@/components/common/CommonUI'
import { MaintenanceTicket, TicketPriority, TicketStatus } from '@/types/assets'
import { UserRole } from '@/types/dashboard'

interface MaintenanceHistoryTabProps {
  tickets: MaintenanceTicket[]
  isLoading?: boolean
  onRaiseTicketClick: () => void
  currentRole: UserRole
}

export const getPriorityVariant = (priority: TicketPriority): 'error' | 'warning' | 'info' | 'neutral' => {
  switch (priority) {
    case 'critical':
      return 'error'
    case 'high':
      return 'warning'
    case 'medium':
      return 'info'
    default:
      return 'neutral'
  }
}

export const getTicketStatusVariant = (status: TicketStatus): 'warning' | 'info' | 'success' | 'neutral' => {
  switch (status) {
    case 'open':
      return 'warning'
    case 'in_progress':
      return 'info'
    case 'resolved':
    case 'closed':
      return 'success'
    default:
      return 'neutral'
  }
}

export const MaintenanceHistoryTab: React.FC<MaintenanceHistoryTabProps> = ({
  tickets,
  isLoading = false,
  onRaiseTicketClick,
  currentRole,
}) => {
  if (isLoading) {
    return (
      <Card className="p-6 border-outline-variant/60 shadow-xs space-y-4">
        <div className="w-40 h-4 bg-surface-container-high rounded animate-pulse" />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-14 bg-surface-container-low rounded animate-pulse" />
          ))}
        </div>
      </Card>
    )
  }

  const canRaise =
    currentRole === 'super_admin' || currentRole === 'it_admin' || currentRole === 'employee'

  if (tickets.length === 0) {
    return (
      <Card className="p-10 border-outline-variant/60 shadow-xs text-center flex flex-col items-center justify-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-outline">
          <Wrench className="w-6 h-6 stroke-1" />
        </div>
        <div className="space-y-1">
          <h4 className="font-sans font-semibold text-sm text-primary">
            No Maintenance Issues Logged
          </h4>
          <p className="text-xs text-on-surface-variant max-w-sm">
            This hardware has clean maintenance records with no open or resolved service tickets.
          </p>
        </div>
        {canRaise && (
          <Button
            variant="outline"
            size="sm"
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={onRaiseTicketClick}
          >
            Raise Service Ticket
          </Button>
        )}
      </Card>
    )
  }

  return (
    <Card className="p-0 border-outline-variant/60 shadow-xs overflow-hidden">
      <div className="p-5 border-b border-outline-variant/40 bg-surface-container-low flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench className="w-4 h-4 text-warning" />
          <h3 className="text-sm font-sans font-bold text-primary">
            Maintenance & Service Tickets ({tickets.length})
          </h3>
        </div>

        {canRaise && (
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={onRaiseTicketClick}
          >
            Raise Ticket
          </Button>
        )}
      </div>

      <div className="overflow-x-auto min-w-full">
        <table className="w-full text-left border-collapse text-xs font-body">
          <thead>
            <tr className="bg-surface-container/50 border-b border-outline-variant/30 text-[11px] font-mono text-outline uppercase tracking-wider select-none">
              <th className="py-3 px-4 font-semibold">Issue Description</th>
              <th className="py-3 px-4 font-semibold">Priority</th>
              <th className="py-3 px-4 font-semibold">Status</th>
              <th className="py-3 px-4 font-semibold">Reported By</th>
              <th className="py-3 px-4 font-semibold">Assigned To</th>
              <th className="py-3 px-4 font-semibold">Date Logged</th>
              <th className="py-3 px-4 font-semibold">Resolved Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/20">
            {tickets.map((ticket) => {
              const createdDate = new Date(ticket.created_at).toLocaleDateString()
              const resolvedDate = ticket.resolved_at
                ? new Date(ticket.resolved_at).toLocaleDateString()
                : '—'

              return (
                <tr key={ticket.id} className="hover:bg-surface-container-low/60 transition-colors">
                  {/* Issue */}
                  <td className="py-3.5 px-4 font-medium text-on-surface max-w-sm">
                    {ticket.issue_description}
                  </td>

                  {/* Priority */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <StatusBadge
                      status={ticket.priority}
                      variant={getPriorityVariant(ticket.priority)}
                    />
                  </td>

                  {/* Status */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <StatusBadge
                      status={ticket.status}
                      variant={getTicketStatusVariant(ticket.status)}
                    />
                  </td>

                  {/* Reported By */}
                  <td className="py-3.5 px-4 font-mono text-on-surface whitespace-nowrap">
                    {ticket.reporter_name || 'Reporter'}
                  </td>

                  {/* Assigned To */}
                  <td className="py-3.5 px-4 font-mono text-outline whitespace-nowrap">
                    {ticket.assignee_name || 'Unassigned IT'}
                  </td>

                  {/* Date Logged */}
                  <td className="py-3.5 px-4 font-mono text-outline whitespace-nowrap">
                    {createdDate}
                  </td>

                  {/* Resolved Date */}
                  <td className="py-3.5 px-4 font-mono text-outline whitespace-nowrap">
                    {resolvedDate}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
