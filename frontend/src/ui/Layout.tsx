import React from 'react'
import { cn } from './cn'

/** Serif page title, one line of context, and the page's actions (one primary). */
export const PageHeader: React.FC<{
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
  eyebrow?: React.ReactNode
  className?: string
}> = ({ title, description, actions, eyebrow, className }) => (
  <header className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
    <div className="flex min-w-0 flex-col gap-1.5">
      {eyebrow && <div className="text-meta text-muted">{eyebrow}</div>}
      <h1 className="font-display text-page text-ink">{title}</h1>
      {description && <p className="text-lead text-muted">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </header>
)

/** Label/value pair for detail panels and record pages. */
export const DetailRow: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({
  label,
  children,
  className,
}) => (
  <div className={cn('flex justify-between gap-4 border-t border-line-soft py-2.5 text-body', className)}>
    <dt className="text-muted">{label}</dt>
    <dd className="m-0 text-right text-ink">{children}</dd>
  </div>
)
