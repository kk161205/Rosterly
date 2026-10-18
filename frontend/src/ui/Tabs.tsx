import React from 'react'
import * as RadixTabs from '@radix-ui/react-tabs'
import { cn } from './cn'
import { useOverflowX } from './Table'

/** Underline tabs on Radix (arrow-key navigation, correct ARIA roles). */
export const Tabs = RadixTabs.Root
export const TabsContent = RadixTabs.Content

export const TabsList: React.FC<{ children: React.ReactNode; label: string; className?: string }> = ({
  children,
  label,
  className,
}) => {
  const { ref, over } = useOverflowX<HTMLDivElement>()
  return (
    <RadixTabs.List
      ref={ref}
      aria-label={label}
      className={cn('scrollbar-none flex flex-nowrap gap-5 overflow-x-auto overflow-y-hidden border-b border-line', over && 'fade-x', className)}
    >
      {children}
    </RadixTabs.List>
  )
}

export const TabsTrigger: React.FC<{ value: string; children: React.ReactNode; count?: number }> = ({
  value,
  children,
  count,
}) => (
  <RadixTabs.Trigger
    value={value}
    className="-mb-px inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-0.5 text-body text-muted transition-colors hover:text-ink data-[state=active]:border-ink data-[state=active]:font-semibold data-[state=active]:text-ink"
  >
    {children}
    {count !== undefined && <span className="text-micro font-normal text-muted">{count}</span>}
  </RadixTabs.Trigger>
)
