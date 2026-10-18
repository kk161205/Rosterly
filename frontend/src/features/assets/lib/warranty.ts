import { daysUntil, formatDate } from '@/lib/format'

/** "Ends 14 Jun 2027", amber within 30 days (§5.7 expiry warning), muted once past. */
export function warrantyInfo(date: string | null | undefined): {
  text: string
  detail: string | null
  tone: 'ink' | 'warn' | 'muted'
} {
  if (!date) return { text: 'Not recorded', detail: null, tone: 'muted' }
  const days = daysUntil(date)
  if (days === null) return { text: formatDate(date), detail: null, tone: 'ink' }
  if (days < 0) return { text: formatDate(date), detail: 'Ended', tone: 'muted' }
  if (days <= 30) return { text: formatDate(date), detail: days === 0 ? 'Ends today' : `${days} days left`, tone: 'warn' }
  const months = Math.round(days / 30.4)
  return {
    text: formatDate(date),
    detail:
      months >= 12
        ? `${Math.floor(months / 12)} ${Math.floor(months / 12) === 1 ? 'year' : 'years'}${months % 12 ? ` ${months % 12} ${months % 12 === 1 ? 'month' : 'months'}` : ''} left`
        : `${months} ${months === 1 ? 'month' : 'months'} left`,
    tone: 'ink',
  }
}

export const toneClass = { ink: 'text-ink', warn: 'text-status-warn', muted: 'text-muted' } as const
