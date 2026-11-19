import React, { useState, useEffect } from 'react'
import { Clock, LogIn, LogOut, CheckCircle } from 'lucide-react'
import { Button, Alert } from '@/ui'
import { useAttendance, useAttendanceMutations } from '@/features/leave/hooks/useAttendance'
import type { AttendanceRecord } from '@/features/leave/types/attendance'

export const QuickAttendanceWidget: React.FC<{ employeeId?: string }> = ({ employeeId }) => {
  const [currentTime, setCurrentTime] = useState<string>('')
  const [workingDuration, setWorkingDuration] = useState<string>('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const todayStr = new Date().toISOString().split('T')[0]
  const { data, refetch } = useAttendance({
    employee_id: employeeId,
    from: todayStr,
    to: todayStr,
  })

  const { checkIn, checkOut } = useAttendanceMutations()

  const todayRecord: AttendanceRecord | undefined = data?.records?.find(
    (r) => r.date === todayStr,
  )

  const isCheckedIn = Boolean(todayRecord?.check_in_time && !todayRecord?.check_out_time)
  const isCheckedOut = Boolean(todayRecord?.check_out_time)

  // Real-time ticking clock
  useEffect(() => {
    const updateClock = () => {
      const now = new Date()
      setCurrentTime(
        now.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }),
      )

      if (isCheckedIn && todayRecord?.check_in_time) {
        const checkInMs = new Date(todayRecord.check_in_time).getTime()
        const diffMs = Math.max(0, now.getTime() - checkInMs)
        const hrs = Math.floor(diffMs / 3600000)
        const mins = Math.floor((diffMs % 3600000) / 60000)
        const secs = Math.floor((diffMs % 60000) / 1000)
        setWorkingDuration(
          `${String(hrs).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`,
        )
      } else {
        setWorkingDuration('')
      }
    }

    updateClock()
    const timer = setInterval(updateClock, 1000)
    return () => clearInterval(timer)
  }, [isCheckedIn, todayRecord])

  const handleToggle = async () => {
    setErrorMessage(null)
    try {
      if (!todayRecord?.check_in_time) {
        await checkIn.mutateAsync()
      } else if (!todayRecord?.check_out_time) {
        await checkOut.mutateAsync()
      }
      refetch()
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to complete attendance check-in/out.',
      )
    }
  }

  const isPending = checkIn.isPending || checkOut.isPending

  return (
    <div
      className="flex flex-col gap-4 rounded-card border border-line bg-paper p-5 sm:flex-row sm:items-center sm:justify-between"
      role="region"
      aria-label="Workplace digital clock and attendance widget"
    >
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-pill bg-ground text-navy">
          <Clock className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="font-mono text-panel font-semibold tracking-wider text-ink">
              {currentTime || '00:00:00'}
            </span>
            {isCheckedIn && (
              <span className="inline-flex items-center gap-1 rounded-pill bg-row-selected px-2.5 py-0.5 font-sans text-micro font-medium text-status-ok">
                <span className="h-1.5 w-1.5 rounded-full bg-status-ok" aria-hidden="true" />
                Active Shift
              </span>
            )}
            {isCheckedOut && (
              <span className="inline-flex items-center gap-1 rounded-pill bg-navy-tint px-2.5 py-0.5 font-sans text-micro font-medium text-navy">
                <CheckCircle className="h-3 w-3" aria-hidden="true" />
                Completed
              </span>
            )}
            {!todayRecord?.check_in_time && (
              <span className="inline-flex items-center gap-1 rounded-pill bg-ground px-2.5 py-0.5 font-sans text-micro font-medium text-muted">
                Not Checked In
              </span>
            )}
          </div>
          <span className="text-micro text-muted">
            {isCheckedIn
              ? `Working duration: ${workingDuration}`
              : isCheckedOut
              ? 'Attendance recorded for today.'
              : 'Digital workplace attendance clock.'}
          </span>
        </div>
      </div>

      <div className="flex flex-col items-end gap-2">
        {errorMessage && <Alert tone="error">{errorMessage}</Alert>}

        {!isCheckedOut ? (
          <Button
            variant={isCheckedIn ? 'secondary' : 'primary'}
            onClick={handleToggle}
            disabled={isPending}
            className="w-full sm:w-auto"
          >
            {isCheckedIn ? (
              <>
                <LogOut className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Check Out
              </>
            ) : (
              <>
                <LogIn className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Check In
              </>
            )}
          </Button>
        ) : (
          <Button variant="secondary" disabled className="w-full sm:w-auto">
            <CheckCircle className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Signed Out
          </Button>
        )}
      </div>
    </div>
  )
}
