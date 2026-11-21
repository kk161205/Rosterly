import React, { useState } from 'react'
import { Alert, Button } from '@/ui'
import { useAttendance, useAttendanceMutations } from '@/features/leave/hooks/useAttendance'
import { getErrorMessage } from '@/lib/errors'
import { localISODate } from '@/lib/format'

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

/**
 * Check in / check out for today. Shown only when the company lets
 * people record attendance themselves (Access → Settings).
 */
export const QuickAttendanceWidget: React.FC<{ employeeId?: string }> = ({ employeeId }) => {
  const [error, setError] = useState<string | null>(null)
  const today = localISODate()
  const { data } = useAttendance({ employee_id: employeeId, from: today, to: today })
  const { checkIn, checkOut } = useAttendanceMutations()
  const record = data?.records?.find((r) => r.date === today)
  const busy = checkIn.isPending || checkOut.isPending

  const run = async (action: () => Promise<unknown>) => {
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(getErrorMessage(err, 'That didn’t work. Please try again.'))
    }
  }

  let summary = 'You haven’t checked in today.'
  if (record?.status === 'on_leave') summary = 'You’re on leave today.'
  else if (record?.check_out_time && record.check_in_time) summary = `Checked in at ${time(record.check_in_time)}, out at ${time(record.check_out_time)}.`
  else if (record?.check_in_time) summary = `Checked in at ${time(record.check_in_time)}.`

  return (
    <section aria-label="Today’s attendance" className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
      <p className="text-body text-ink">{summary}</p>
      {error && <Alert>{error}</Alert>}
      {record?.status !== 'on_leave' && !record?.check_out_time && (
        <Button
          variant="secondary"
          isLoading={busy}
          onClick={() => run(() => (record?.check_in_time ? checkOut.mutateAsync() : checkIn.mutateAsync()))}
        >
          {record?.check_in_time ? 'Check out' : 'Check in'}
        </Button>
      )}
    </section>
  )
}
