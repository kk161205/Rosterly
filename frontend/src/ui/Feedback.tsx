import React from 'react'
import { AlertCircle, CheckCircle2, Info } from 'lucide-react'
import { Button } from './Button'
import { cn } from './cn'

/** Inline message for form-level errors and confirmations. */
export const Alert: React.FC<{
  tone?: 'error' | 'success' | 'info'
  children: React.ReactNode
  className?: string
}> = ({ tone = 'error', children, className }) => {
  const Icon = tone === 'error' ? AlertCircle : tone === 'success' ? CheckCircle2 : Info
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2.5 rounded-card px-3.5 py-3 text-body',
        tone === 'error' && 'bg-bad-tint text-status-bad',
        tone === 'success' && 'bg-row-selected text-status-ok',
        tone === 'info' && 'bg-navy-tint text-navy',
        className,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** Empty state: what this is and one way forward. */
export const EmptyState: React.FC<{
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}> = ({ title, description, action, className }) => (
  <div className={cn('flex flex-col items-start gap-2 py-12', className)}>
    <h3 className="font-display text-panel text-ink">{title}</h3>
    {description && <p className="max-w-md text-lead text-muted">{description}</p>}
    {action && <div className="pt-2">{action}</div>}
  </div>
)

/** Error state: what failed and a retry. */
export const ErrorState: React.FC<{ message: string; onRetry?: () => void; className?: string }> = ({
  message,
  onRetry,
  className,
}) => (
  <div className={cn('flex flex-col items-start gap-3 py-10', className)}>
    <Alert tone="error">{message}</Alert>
    {onRetry && (
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Try again
      </Button>
    )}
  </div>
)

/** Loading placeholder sized like the content it replaces. */
export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn('animate-pulse rounded-soft bg-row-selected', className)} aria-hidden="true" />
)
