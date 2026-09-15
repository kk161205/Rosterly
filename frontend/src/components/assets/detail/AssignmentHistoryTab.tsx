import React from 'react'
import { UserCheck, History } from 'lucide-react'
import { Card } from '@/components/common/CommonUI'
import { AssetAssignment } from '@/types/assets'

interface AssignmentHistoryTabProps {
  assignments: AssetAssignment[]
  isLoading?: boolean
}

export const AssignmentHistoryTab: React.FC<AssignmentHistoryTabProps> = ({
  assignments,
  isLoading = false,
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

  if (assignments.length === 0) {
    return (
      <Card className="p-10 border-outline-variant/60 shadow-xs text-center flex flex-col items-center justify-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-outline">
          <History className="w-6 h-6 stroke-1" />
        </div>
        <div className="space-y-1">
          <h4 className="font-sans font-semibold text-sm text-primary">No Assignment History</h4>
          <p className="text-xs text-on-surface-variant max-w-sm">
            This asset has not been assigned to any employees yet. It is currently in stock.
          </p>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-0 border-outline-variant/60 shadow-xs overflow-hidden">
      <div className="p-5 border-b border-outline-variant/40 bg-surface-container-low flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-sans font-bold text-primary">
            Historical Custody & Assignment Log ({assignments.length})
          </h3>
        </div>
        <span className="text-xs font-mono text-outline">Chronological Order</span>
      </div>

      <div className="overflow-x-auto min-w-full">
        <table className="w-full text-left border-collapse text-xs font-body">
          <thead>
            <tr className="bg-surface-container/50 border-b border-outline-variant/30 text-[11px] font-mono text-outline uppercase tracking-wider select-none">
              <th className="py-3 px-4 font-semibold">Employee</th>
              <th className="py-3 px-4 font-semibold">Assigned Date</th>
              <th className="py-3 px-4 font-semibold">Return Date / Status</th>
              <th className="py-3 px-4 font-semibold">Condition at Assign</th>
              <th className="py-3 px-4 font-semibold">Condition at Return</th>
              <th className="py-3 px-4 font-semibold">Handled By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/20">
            {assignments.map((record) => {
              const isActive = !record.returned_at
              const assignedDate = new Date(record.assigned_at).toLocaleDateString()
              const returnedDate = record.returned_at
                ? new Date(record.returned_at).toLocaleDateString()
                : null

              return (
                <tr
                  key={record.id}
                  className={`hover:bg-surface-container-low/60 transition-colors ${
                    isActive ? 'bg-accent/5' : ''
                  }`}
                >
                  {/* Employee */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-accent text-on-accent font-semibold text-xs flex items-center justify-center flex-shrink-0">
                        {record.employee_name ? record.employee_name.charAt(0).toUpperCase() : 'E'}
                      </div>
                      <div>
                        <div className="font-semibold text-on-surface">
                          {record.employee_name || 'Employee'}
                        </div>
                        <div className="text-[10px] font-mono text-outline">
                          ID: {record.employee_id.slice(0, 8)}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Assigned Date */}
                  <td className="py-3.5 px-4 font-mono text-on-surface whitespace-nowrap">
                    {assignedDate}
                  </td>

                  {/* Return Date / Active Status */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {isActive ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono bg-success-container text-on-success-container border border-success/20 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-success" />
                        Currently Active
                      </span>
                    ) : (
                      <span className="font-mono text-on-surface-variant">
                        Returned {returnedDate}
                      </span>
                    )}
                  </td>

                  {/* Condition at Assign */}
                  <td className="py-3.5 px-4 max-w-xs">
                    <span className="text-on-surface-variant line-clamp-2">
                      {record.condition_at_assignment}
                    </span>
                  </td>

                  {/* Condition at Return */}
                  <td className="py-3.5 px-4 max-w-xs">
                    <span className="text-on-surface-variant line-clamp-2">
                      {record.condition_at_return || (isActive ? '—' : 'Not recorded')}
                    </span>
                  </td>

                  {/* Handled By */}
                  <td className="py-3.5 px-4 font-mono text-outline whitespace-nowrap">
                    {record.assigned_by_name || 'Admin'}
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
