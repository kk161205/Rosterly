import React from 'react'
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import { Logo, cn } from '@/ui'
import type { VisibleSection } from '@/shell/nav'
import { UserMenu } from '@/shell/UserMenu'
import type { UserProfile } from '@/features/auth/types/auth'

interface SidebarProps {
  sections: VisibleSection[]
  active?: VisibleSection
  inboxCount?: number
  user: UserProfile | null
  onSearch: () => void
  onNavigate?: () => void
  className?: string
}

/**
 * Navigation recedes (DESIGN.md, Principles): a tinted column, one flat list,
 * the current section as a white pill. The user and sign-out sit at the bottom.
 */
export const Sidebar: React.FC<SidebarProps> = ({
  sections,
  active,
  inboxCount,
  user,
  onSearch,
  onNavigate,
  className,
}) => (
  <div className={cn('flex h-full flex-col bg-sidebar px-3 pb-4 pt-5', className)}>
    <Link to="/home" onClick={onNavigate} className="mb-5 rounded-pill px-3 py-1" aria-label="Rosterly, go to Home">
      <Logo markClassName="h-6 w-6" />
    </Link>

    <button
      type="button"
      onClick={onSearch}
      className="mb-4 flex min-h-10 items-center gap-2.5 rounded-pill border border-line bg-ground px-3 text-body text-muted transition-colors hover:border-control hover:text-ink"
    >
      <Search className="h-4 w-4" aria-hidden="true" />
      <span className="flex-1 text-left">Search</span>
      <kbd className="font-sans text-micro text-muted">Ctrl K</kbd>
    </button>

    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {sections.map((section) => {
        const isActive = active?.label === section.label
        const count = section.showCount ? inboxCount : undefined
        return (
          <Link
            key={section.label}
            to={section.path}
            onClick={onNavigate}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex min-h-10 items-center gap-2 rounded-pill px-3 text-body font-medium transition-colors',
              isActive ? 'bg-paper text-ink' : 'text-muted hover:text-ink',
            )}
          >
            <span className="flex-1">{section.label}</span>
            {count !== undefined && count > 0 && (
              <span className="text-micro font-normal tabular-nums text-muted">
                {count}
                <span className="sr-only"> waiting</span>
              </span>
            )}
          </Link>
        )
      })}
    </nav>

    <div className="mt-auto pt-6">
      <UserMenu user={user} onNavigate={onNavigate} />
    </div>
  </div>
)
