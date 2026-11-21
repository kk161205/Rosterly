import React, { useState } from 'react'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { useAttendance } from '@/features/leave/hooks/useAttendance'
import { useHolidays } from '@/features/leave/hooks/useLeave'
import type { AttendanceRecord, AttendanceStatus } from '@/features/leave/types/attendance'
import { Skeleton, ErrorState } from '@/ui'
import { getErrorMessage } from '@/lib/errors'

const STATUS_CONFIG: Record<
  AttendanceStatus,
  { label: string; bg: string; text: string; dot: string }
> = {
  present: {
    label: 'Present',
    bg: 'bg-paper border-line-soft',
    text: 'text-status-ok',
    dot: 'bg-status-ok',
  },
  on_leave: {
    label: 'On Leave',
    bg: 'bg-paper border-line-soft',
    text: 'text-status-warn',
    dot: 'bg-status-warn',
  },
  half_day: {
    label: 'Half Day',
    bg: 'bg-paper border-line-soft',
    text: 'text-status-info',
    dot: 'bg-status-info',
  },
  absent: {
    label: 'Absent',
    bg: 'bg-paper border-line-soft',
    text: 'text-status-bad',
    dot: 'bg-status-bad',
  },
  holiday: {
    label: 'Holiday',
    bg: 'bg-paper border-line-soft',
    text: 'text-status-mute',
    dot: 'bg-status-mute',
  },
}

export const AttendanceHeatmap: React.FC<{ employeeId?: string }> = ({ employeeId }) => {
  const [currentDate, setCurrentDate] = useState(() => new Date())

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  // First day of month and total days in month
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const totalDays = lastDay.getDate()

  // Convert getDay() (0 is Sun) to Monday-based (0 is Mon)
  const startDayOfWeek = (firstDay.getDay() + 6) % 7

  const fromStr = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const toStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(totalDays).padStart(2, '0')}`

  const { data, isLoading, isError, error, refetch } = useAttendance({
    employee_id: employeeId,
    from: fromStr,
    to: toStr,
    page_size: 100,
  })

  const holidays = useHolidays(year)
  const holidayDates = new Set((holidays.data ?? []).map((h) => h.date))

  const records = data?.records || []
  const recordMap = new Map<string, AttendanceRecord>()
  records.forEach((r) => recordMap.set(r.date, r))

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
  }

  const monthName = currentDate.toLocaleString('en-IN', { month: 'long', year: 'numeric' })
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <div className="flex flex-col gap-4">
      {/* Month Navigation Header */}
      <div className="flex items-center justify-between border-b border-ink pb-2">
        <div className="flex items-center gap-2.5">
          <Calendar className="h-4 w-4 text-muted" aria-hidden="true" />
          <h3 className="text-section text-ink">{monthName}</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handlePrevMonth}
            aria-label="Previous month"
            className="rounded p-1.5 text-muted hover:bg-ground hover:text-ink focus:outline-none focus:ring-2 focus:ring-navy"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            aria-label="Next month"
            className="rounded p-1.5 text-muted hover:bg-ground hover:text-ink focus:outline-none focus:ring-2 focus:ring-navy"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-7 gap-2 py-4" aria-label="Loading attendance heatmap">
          {Array.from({ length: 35 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          message={getErrorMessage(error, 'Could not load attendance calendar.')}
          onRetry={() => refetch()}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-2 text-center text-meta font-medium text-muted">
            {weekdays.map((w) => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-2">
            {/* Blank offset cells */}
            {Array.from({ length: startDayOfWeek }).map((_, i) => (
              <div key={`blank-${i}`} className="h-20 rounded border border-transparent" />
            ))}

            {/* Month Day Cells */}
            {Array.from({ length: totalDays }).map((_, i) => {
              const dayNum = i + 1
              const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
              const record = recordMap.get(dateKey)
              const cellDate = new Date(year, month, dayNum)
              const isWeekend = cellDate.getDay() === 0 || cellDate.getDay() === 6

              let statusConfig = record ? STATUS_CONFIG[record.status] : null
              if (!statusConfig && (isWeekend || holidayDates.has(dateKey))) {
                statusConfig = STATUS_CONFIG.holiday
              }

              const checkInTime = record?.check_in_time
                ? new Date(record.check_in_time).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : null
              const checkOutTime = record?.check_out_time
                ? new Date(record.check_out_time).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : null

              return (
                <div
                  key={dateKey}
                  title={
                    record
                      ? `${dateKey}: ${statusConfig?.label || 'Status Recorded'}${
                          checkInTime ? ` (In: ${checkInTime}${checkOutTime ? `, Out: ${checkOutTime}` : ''})` : ''
                        }`
                      : isWeekend
                      ? `${dateKey}: Weekend`
                      : `${dateKey}: No attendance recorded`
                  }
                  className={`group relative flex h-20 flex-col justify-between rounded-soft border p-2 text-body transition-colors ${
                    statusConfig ? statusConfig.bg : 'border-line bg-paper hover:bg-ground/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-micro font-medium text-ink">{dayNum}</span>
                    {statusConfig && (
                      <span
                        className={`h-2 w-2 rounded-full ${statusConfig.dot}`}
                        aria-hidden="true"
                      />
                    )}
                  </div>

                  <div className="flex flex-col text-micro">
                    {record && statusConfig && (
                      <span className={`font-medium ${statusConfig.text}`}>
                        {statusConfig.label}
                      </span>
                    )}
                    {checkInTime && (
                      <span className="text-micro text-muted">
                        {checkInTime}
                        {checkOutTime ? `–${checkOutTime}` : ''}
                      </span>
                    )}
                    {!record && isWeekend && (
                      <span className="text-micro text-muted/60">Weekend</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-5 border-t border-line-soft pt-3 text-meta text-muted">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-status-ok" />
              <span>Present</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-status-warn" />
              <span>On Leave</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-status-info" />
              <span>Half Day</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-status-bad" />
              <span>Absent</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-status-mute" />
              <span>Weekend / Holiday</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
