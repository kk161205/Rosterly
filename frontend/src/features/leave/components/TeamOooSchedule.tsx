import React, { useMemo } from 'react'
import { useHolidays, useTeamLeave } from '@/features/leave/hooks/useLeave'
import type { LeaveRequestResponse } from '@/features/leave/types/leave'
import { getErrorMessage } from '@/lib/errors'
import { localISODate } from '@/lib/format'
import { ErrorState, Skeleton } from '@/ui'

const WINDOW_DAYS = 14

/**
 * Who's off in the next two weeks — approved and pending leave for the
 * people you approve, so you can check cover before saying yes.
 */
export const TeamOooSchedule: React.FC = () => {
  const days = useMemo(() => {
    const out: { iso: string; label: string; weekend: boolean }[] = []
    const d = new Date()
    for (let i = 0; i < WINDOW_DAYS; i++) {
      out.push({
        iso: localISODate(d),
        label: d.toLocaleDateString('en-IN', { weekday: 'narrow', day: 'numeric' }),
        weekend: d.getDay() === 0 || d.getDay() === 6,
      })
      d.setDate(d.getDate() + 1)
    }
    return out
  }, [])
  const from = days[0].iso
  const to = days[days.length - 1].iso
  const team = useTeamLeave(from, to)
  const holidays = useHolidays(Number(from.slice(0, 4)))
  const nextYear = useHolidays(Number(to.slice(0, 4)))
  const holidaySet = new Set([...(holidays.data ?? []), ...(nextYear.data ?? [])].map((h) => h.date))

  const people = useMemo(() => {
    const map = new Map<string, { id: string; name: string; leaves: LeaveRequestResponse[] }>()
    for (const l of team.data?.items ?? []) {
      const entry = map.get(l.employee_id) ?? { id: l.employee_id, name: l.employee_name ?? 'Someone', leaves: [] }
      entry.leaves.push(l)
      map.set(l.employee_id, entry)
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [team.data])

  const leaveOn = (leaves: LeaveRequestResponse[], iso: string) => leaves.find((l) => l.start_date <= iso && iso <= l.end_date)
  const offCount = (iso: string) => people.filter((p) => leaveOn(p.leaves, iso)).length

  return (
    <section aria-labelledby="team-ooo-heading" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="team-ooo-heading" className="text-section text-ink">
          Who’s off in the next two weeks
        </h2>
        <p className="text-meta text-muted">Approved leave is solid; leave waiting for a decision is outlined.</p>
      </div>
      {team.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : team.isError ? (
        <ErrorState message={getErrorMessage(team.error)} onRetry={() => team.refetch()} />
      ) : people.length === 0 ? (
        <p className="border-t border-ink pt-3 text-body text-muted">Nobody you approve is off in the next two weeks.</p>
      ) : (
        <div className="overflow-x-auto border-t border-ink">
          <table className="w-full min-w-max border-collapse text-meta">
            <thead>
              <tr>
                <th scope="col" className="py-2 pr-3 text-left font-medium text-muted">
                  Person
                </th>
                {days.map((d) => (
                  <th key={d.iso} scope="col" className={`w-8 py-2 text-center font-normal ${d.weekend || holidaySet.has(d.iso) ? 'text-faint' : 'text-muted'}`}>
                    {d.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id} className="border-t border-line-soft">
                  <th scope="row" className="py-2 pr-3 text-left font-medium text-ink">
                    {p.name}
                  </th>
                  {days.map((d) => {
                    const l = leaveOn(p.leaves, d.iso)
                    const off = l && !d.weekend && !holidaySet.has(d.iso)
                    return (
                      <td key={d.iso} className="py-2 text-center">
                        {off ? (
                          <span
                            title={`${l.leave_type.name} — ${l.status === 'approved' ? 'approved' : 'waiting for a decision'}`}
                            className={`mx-auto block h-4 w-4 rounded-soft ${l.status === 'approved' ? 'bg-navy' : 'border-2 border-navy'}`}
                          >
                            <span className="sr-only">
                              {p.name} off {d.iso} ({l.status === 'approved' ? 'approved' : 'pending'})
                            </span>
                          </span>
                        ) : null}
                      </td>
                    )
                  })}
                </tr>
              ))}
              <tr className="border-t border-line">
                <th scope="row" className="py-2 pr-3 text-left font-normal text-muted">
                  People off
                </th>
                {days.map((d) => {
                  const n = d.weekend || holidaySet.has(d.iso) ? 0 : offCount(d.iso)
                  return (
                    <td key={d.iso} className={`py-2 text-center tabular-nums ${n >= 2 ? 'font-semibold text-status-warn' : 'text-muted'}`}>
                      {n || ''}
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
