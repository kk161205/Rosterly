import React from 'react'
import { cn } from './cn'

/**
 * Status is a coloured word with a still dot (DESIGN.md) — never a
 * tinted badge, never colour alone, never a pulse.
 */
type StatusTone = 'ok' | 'info' | 'warn' | 'bad' | 'mute'

const toneClass: Record<StatusTone, string> = {
  ok: 'text-status-ok',
  info: 'text-status-info',
  warn: 'text-status-warn',
  bad: 'text-status-bad',
  mute: 'text-status-mute',
}

export const StatusText: React.FC<{ tone: StatusTone; children: React.ReactNode; className?: string }> = ({
  tone,
  children,
  className,
}) => (
  <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-meta font-medium', toneClass[tone], className)}>
    <span className="h-2 w-2 shrink-0 rounded-full bg-current" aria-hidden="true" />
    {children}
  </span>
)

/** Shared status vocabulary so the same state reads the same on every page. */
const STATUS_TONES: Record<string, StatusTone> = {
  // assets
  in_stock: 'ok',
  assigned: 'info',
  under_maintenance: 'warn',
  retired: 'mute',
  lost: 'bad',
  // people
  active: 'ok',
  onboarding: 'info',
  offboarding: 'warn',
  inactive: 'mute',
  terminated: 'mute',
  // requests & approvals
  pending: 'info',
  approved: 'ok',
  rejected: 'bad',
  cancelled: 'mute',
  completed: 'ok',
  in_progress: 'warn',
  skipped: 'mute',
  // tickets & tasks
  open: 'info',
  resolved: 'ok',
  closed: 'mute',
  done: 'ok',
}

const STATUS_LABELS: Record<string, string> = {
  in_stock: 'In stock',
  under_maintenance: 'In repair',
  in_progress: 'In progress',
}

function statusTone(status: string | null | undefined): StatusTone {
  return (status && STATUS_TONES[status]) || 'mute'
}

export function statusLabel(status: string | null | undefined): string {
  if (!status) return 'Unknown'
  return STATUS_LABELS[status] ?? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ')
}

/** StatusText for a raw API status value. */
export const Status: React.FC<{ value: string | null | undefined; className?: string }> = ({ value, className }) => (
  <StatusText tone={statusTone(value)} className={className}>
    {statusLabel(value)}
  </StatusText>
)
