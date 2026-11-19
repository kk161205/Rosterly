import React from 'react'
import { HeartPulse, Coffee, Award, CalendarClock } from 'lucide-react'
import type { LeaveBalanceItem } from '@/features/leave/types/leave'

interface LeaveQuotaCardsProps {
  balances: LeaveBalanceItem[]
}

const DEFAULT_QUOTAS = {
  sick: { label: 'Sick Leave', total: 12, icon: HeartPulse, rollover: 'Expires yearly' },
  casual: { label: 'Casual Leave', total: 12, icon: Coffee, rollover: 'Expires yearly' },
  earned: { label: 'Earned Leave', total: 18, icon: Award, rollover: 'Carries over up to 5 days' },
  unpaid: { label: 'Unpaid Leave', total: 30, icon: CalendarClock, rollover: 'Discretionary manager approval' },
}

export const LeaveQuotaCards: React.FC<LeaveQuotaCardsProps> = ({ balances }) => {
  const getBalance = (type: 'sick' | 'casual' | 'earned' | 'unpaid') => {
    const item = balances.find((b) => b.leave_type === type)
    return item ? Number(item.balance_days) : 0
  }

  const types: ('sick' | 'casual' | 'earned' | 'unpaid')[] = ['sick', 'casual', 'earned', 'unpaid']

  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      role="region"
      aria-label="Leave quota balances"
    >
      {types.map((type) => {
        const config = DEFAULT_QUOTAS[type]
        const remaining = getBalance(type)
        const total = config.total
        const percentage = Math.min(100, Math.max(0, Math.round((remaining / total) * 100)))
        const Icon = config.icon

        return (
          <div
            key={type}
            className="flex flex-col justify-between rounded-card border border-line bg-paper p-4 transition-shadow"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-body font-semibold text-ink">{config.label}</span>
                <span className="text-micro text-muted">{config.rollover}</span>
              </div>
              <div className="rounded-pill bg-ground p-2 text-navy">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <span className="font-display text-panel text-ink">
                  {remaining} <span className="text-lead font-normal text-muted">/ {total} Days</span>
                </span>
                <span className="font-mono text-micro text-muted">{percentage}% left</span>
              </div>

              {/* Progress gauge bar */}
              <div className="h-1.5 w-full overflow-hidden rounded-pill bg-ground">
                <div
                  className={`h-full transition-all duration-300 ${
                    remaining <= 2
                      ? 'bg-status-bad'
                      : remaining <= 5
                      ? 'bg-status-warn'
                      : 'bg-navy'
                  }`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
