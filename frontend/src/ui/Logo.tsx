import React from 'react'
import { cn } from './cn'

/**
 * The Rosterly mark (four tiles, the top-right one turned) with the wordmark.
 * The turned tile is the AI Guide at rest: while the Guide
 * is out, its slot shows as a dashed outline. Its colour never changes with
 * the person's accent.
 */
const LogoMark: React.FC<{ className?: string; tileOut?: boolean }> = ({ className, tileOut = false }) => (
  <svg viewBox="0 0 28 28" className={cn('h-7 w-7 text-brand', className)} aria-hidden="true" focusable="false">
    <rect x="2" y="3" width="10.5" height="10.5" rx="2.6" fill="currentColor" />
    <rect
      data-guide-home=""
      x="15.5"
      y="1.6"
      width="10.5"
      height="10.5"
      rx="2.6"
      transform="rotate(-14 20.75 6.85)"
      fill={tileOut ? 'none' : 'currentColor'}
      stroke={tileOut ? 'currentColor' : 'none'}
      strokeWidth={tileOut ? 1.2 : 0}
      strokeDasharray={tileOut ? '2.2 1.6' : undefined}
    />
    <rect x="2" y="15.5" width="10.5" height="10.5" rx="2.6" fill="currentColor" />
    <rect x="15.5" y="15.5" width="10.5" height="10.5" rx="2.6" fill="currentColor" />
  </svg>
)

export const Logo: React.FC<{ className?: string; markClassName?: string; tileOut?: boolean }> = ({ className, markClassName, tileOut }) => (
  <span className={cn('inline-flex items-center gap-2.5', className)}>
    <LogoMark className={markClassName} tileOut={tileOut} />
    <span className="text-wordmark text-ink">Rosterly</span>
  </span>
)
