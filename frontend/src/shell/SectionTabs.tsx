import React from 'react'
import { Link } from 'react-router-dom'
import type { NavLink, VisibleSection } from '@/shell/nav'
import { cn } from '@/ui'

/** Underline tabs for a section's pages (People: Directory / Onboarding / Offboarding). */
export const SectionTabs: React.FC<{ section: VisibleSection; active?: NavLink }> = ({ section, active }) => (
  <nav aria-label={section.label} className="flex flex-wrap gap-5 border-b border-line">
    {section.links.map((link) => {
      const isActive = active?.path === link.path
      return (
        <Link
          key={link.path}
          to={link.path}
          aria-current={isActive ? 'page' : undefined}
          className={cn(
            '-mb-px inline-flex min-h-10 items-center border-b-2 px-0.5 text-body transition-colors',
            isActive ? 'border-ink font-semibold text-ink' : 'border-transparent text-muted hover:text-ink',
          )}
        >
          {link.label}
        </Link>
      )
    })}
  </nav>
)
