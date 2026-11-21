import React from 'react'
import type { LeaveBalanceItem } from '@/features/leave/types/leave'

const days = (value: string | number) => {
  const n = Number(value)
  return `${Number.isInteger(n) ? n : n.toFixed(1)} ${n === 1 ? 'day' : 'days'}`
}

/**
 * This year's leave, one figure per leave type the company offers.
 * Numbers come from the company's own leave types — nothing is assumed here.
 */
export const LeaveBalances: React.FC<{ balances: LeaveBalanceItem[] }> = ({ balances }) => {
  if (balances.length === 0) return null
  return (
    <section aria-label="Your leave this year">
      <dl className="m-0 grid grid-cols-2 gap-x-8 gap-y-5 border-t border-ink pt-4 sm:grid-cols-3 lg:grid-cols-4">
        {balances.map((b) => {
          const pending = Number(b.pending_days)
          return (
            <div key={b.leave_type.id} className="flex flex-col gap-1">
              <dt className="text-meta text-muted">{b.leave_type.name}</dt>
              <dd className="m-0 flex flex-col gap-0.5">
                {b.balance_days === null ? (
                  <span className="text-lead font-medium text-ink">No limit</span>
                ) : (
                  <span className="font-display text-panel text-ink">{days(b.balance_days)} left</span>
                )}
                <span className="text-meta text-muted">
                  {b.annual_days !== null && `${days(b.annual_days)} a year`}
                  {b.annual_days !== null && pending > 0 && ' · '}
                  {pending > 0 && `${days(pending)} waiting for approval`}
                  {!b.leave_type.is_paid && (b.annual_days !== null || pending > 0 ? ' · unpaid' : 'Unpaid')}
                </span>
              </dd>
            </div>
          )
        })}
      </dl>
    </section>
  )
}
