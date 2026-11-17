import React from 'react'
import { cn } from '@/ui'

export const AuditActionChip: React.FC<{ action: string }> = ({ action }) => {
  const norm = action.toLowerCase()
  let toneClass = 'bg-ground text-ink border-line'

  if (norm.includes('create') || norm.includes('insert') || norm.includes('approve')) {
    toneClass = 'bg-row-selected text-status-ok border-status-ok/30'
  } else if (norm.includes('update') || norm.includes('patch') || norm.includes('edit')) {
    toneClass = 'bg-navy-tint text-status-info border-status-info/30'
  } else if (norm.includes('delete') || norm.includes('remove') || norm.includes('revoke') || norm.includes('reject')) {
    toneClass = 'bg-bad-tint text-status-bad border-status-bad/30'
  } else if (norm.includes('login') || norm.includes('session')) {
    toneClass = 'bg-ground text-navy border-control'
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill border px-2.5 py-0.5 font-mono text-micro font-medium uppercase tracking-wide',
        toneClass,
      )}
    >
      {action}
    </span>
  )
}
