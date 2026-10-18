import React from 'react'
import { cn } from './cn'

/** The Rosterly mark (four tiles, the top-right one turned) with the wordmark. */
const LogoMark: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 28 28" className={cn('h-7 w-7 text-navy', className)} aria-hidden="true" focusable="false">
    <rect x="2" y="3" width="10.5" height="10.5" rx="2.6" fill="currentColor" />
    <rect x="15.5" y="1.6" width="10.5" height="10.5" rx="2.6" fill="currentColor" transform="rotate(-14 20.75 6.85)" />
    <rect x="2" y="15.5" width="10.5" height="10.5" rx="2.6" fill="currentColor" />
    <rect x="15.5" y="15.5" width="10.5" height="10.5" rx="2.6" fill="currentColor" />
  </svg>
)

export const Logo: React.FC<{ className?: string; markClassName?: string }> = ({ className, markClassName }) => (
  <span className={cn('inline-flex items-center gap-2.5', className)}>
    <LogoMark className={markClassName} />
    <span className="text-wordmark text-ink">Rosterly</span>
  </span>
)
