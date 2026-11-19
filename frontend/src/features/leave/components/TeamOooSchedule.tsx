import React from 'react'
import { Users, AlertTriangle } from 'lucide-react'
import type { LeaveRequestResponse } from '@/features/leave/types/leave'

interface TeamOooScheduleProps {
  leaves: LeaveRequestResponse[]
}

export const TeamOooSchedule: React.FC<TeamOooScheduleProps> = ({ leaves }) => {
  // Generate next 14 days
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const days: { date: Date; dateStr: string; label: string; isWeekend: boolean }[] = []
  for (let i = 0; i < 14; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    const isWeekend = d.getDay() === 0 || d.getDay() === 6
    days.push({
      date: d,
      dateStr: d.toISOString().split('T')[0],
      label: d.toLocaleDateString('en-IN', { weekday: 'narrow', day: 'numeric' }),
      isWeekend,
    })
  }

  // Filter leaves that overlap with the 14-day window and are active (approved or pending)
  const windowStart = days[0].date.getTime()
  const windowEnd = days[days.length - 1].date.getTime()

  const activeLeaves = leaves.filter((l) => {
    if (l.status === 'rejected' || l.status === 'cancelled') return false
    const lStart = new Date(l.start_date).getTime()
    const lEnd = new Date(l.end_date).getTime()
    return lStart <= windowEnd && lEnd >= windowStart
  })

  // Group leaves by employee
  const employeeMap = new Map<string, { name: string; email: string; leaves: LeaveRequestResponse[] }>()
  for (const l of activeLeaves) {
    const empId = l.employee_id
    const name = l.employee_name || 'Team Member'
    const email = l.employee_email || ''
    if (!employeeMap.has(empId)) {
      employeeMap.set(empId, { name, email, leaves: [] })
    }
    employeeMap.get(empId)!.leaves.push(l)
  }

  const employeeRows = Array.from(employeeMap.values())

  // Check overlap per day to detect coverage shortages (e.g. >= 2 people off)
  const dailyAbsenceCounts = days.map((day) => {
    const dTime = day.date.getTime()
    let count = 0
    for (const l of activeLeaves) {
      const lStart = new Date(l.start_date).getTime()
      const lEnd = new Date(l.end_date).getTime()
      if (dTime >= lStart && dTime <= lEnd && !day.isWeekend) {
        count++
      }
    }
    return { ...day, count }
  })

  const hasCoverageShortage = dailyAbsenceCounts.some((d) => d.count >= 2)

  return (
    <div className="flex flex-col gap-4 rounded-card border border-line bg-paper p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-navy" aria-hidden="true" />
          <h3 className="font-display text-panel text-ink">Team Out-of-Office Schedule</h3>
        </div>
        <span className="text-meta text-muted">14-day rolling team coverage window</span>
      </div>

      {hasCoverageShortage && (
        <div className="flex items-center gap-2 rounded bg-bad-tint/60 px-3 py-2 text-meta text-status-bad">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Coverage Notice: 2 or more team members have overlapping leave requests in this period.
          </span>
        </div>
      )}

      {employeeRows.length === 0 ? (
        <div className="py-8 text-center text-body text-muted">
          No team members scheduled out of office over the next 14 days.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[650px]">
            {/* Header dates */}
            <div className="grid grid-cols-[180px_repeat(14,1fr)] gap-1 border-b border-ink pb-2 text-center text-micro font-medium text-muted">
              <div className="text-left pl-2">Team Member</div>
              {days.map((d) => (
                <div
                  key={d.dateStr}
                  className={`flex flex-col items-center justify-center py-1 rounded ${
                    d.isWeekend ? 'bg-ground text-muted/60' : 'text-ink'
                  }`}
                >
                  <span>{d.label}</span>
                </div>
              ))}
            </div>

            {/* Employee rows */}
            <div className="divide-y divide-line-soft">
              {employeeRows.map((emp) => (
                <div
                  key={emp.email}
                  className="grid grid-cols-[180px_repeat(14,1fr)] items-center gap-1 py-2.5"
                >
                  <div className="flex flex-col truncate pl-2">
                    <span className="truncate text-body font-medium text-ink">{emp.name}</span>
                    <span className="truncate text-micro text-muted">{emp.email}</span>
                  </div>

                  {days.map((day) => {
                    const dTime = day.date.getTime()
                    const matchingLeave = emp.leaves.find((l) => {
                      const lStart = new Date(l.start_date).getTime()
                      const lEnd = new Date(l.end_date).getTime()
                      return dTime >= lStart && dTime <= lEnd
                    })

                    const isOut = Boolean(matchingLeave && !day.isWeekend)
                    const isPending = matchingLeave?.status === 'pending'

                    return (
                      <div
                        key={day.dateStr}
                        className="flex h-8 items-center justify-center"
                        title={
                          matchingLeave
                            ? `${emp.name}: ${matchingLeave.leave_type.toUpperCase()} (${matchingLeave.status})`
                            : undefined
                        }
                      >
                        {isOut ? (
                          <div
                            className={`h-6 w-full rounded ${
                              isPending
                                ? 'border border-dashed border-status-warn bg-amber-100 text-amber-900'
                                : 'bg-navy text-paper'
                            } flex items-center justify-center text-[10px] font-semibold uppercase`}
                          >
                            {matchingLeave!.leave_type.charAt(0)}
                          </div>
                        ) : day.isWeekend ? (
                          <div className="h-6 w-full rounded bg-ground/60" />
                        ) : (
                          <div className="h-6 w-full rounded bg-transparent" />
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
