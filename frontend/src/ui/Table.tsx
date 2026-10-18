import React, { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { Button } from './Button'
import { cn } from './cn'

/**
 * Lists (DESIGN.md): an ink rule over the header, hairlines
 * between rows, no box. Rows that open something are whole-row buttons via
 * `onClick` + a focusable first cell. Below `md` pages render a stacked list
 * instead of the table (see each page).
 */
export const Table: React.FC<{ children: React.ReactNode; label: string; className?: string }> = ({
  children,
  label,
  className,
}) => (
  <div className={cn('overflow-x-auto', className)}>
    <table className="w-full border-collapse text-left text-body" aria-label={label}>
      {children}
    </table>
  </div>
)

export const THead: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <thead className="border-b border-ink">
    <tr>{children}</tr>
  </thead>
)

export const Th: React.FC<{ children?: React.ReactNode; className?: string; srOnly?: boolean }> = ({
  children,
  className,
  srOnly,
}) => (
  <th scope="col" className={cn('whitespace-nowrap px-3 py-2.5 text-meta font-medium text-muted', className)}>
    {srOnly ? <span className="sr-only">{children}</span> : children}
  </th>
)

export const Tr: React.FC<{
  children: React.ReactNode
  onClick?: () => void
  selected?: boolean
  className?: string
}> = ({ children, onClick, selected, className }) => (
  <tr
    onClick={onClick}
    className={cn(
      'border-b border-line-soft transition-colors',
      onClick && 'cursor-pointer hover:bg-row-hover',
      selected && 'bg-row-selected hover:bg-row-selected',
      className,
    )}
  >
    {children}
  </tr>
)

export const Td: React.FC<{ children?: React.ReactNode; className?: string }> = ({ children, className }) => (
  <td className={cn('px-3 py-3 align-top', className)}>{children}</td>
)

/** The first cell's title as a real button, so keyboard users can open the row. */
export const RowButton: React.FC<{ children: React.ReactNode; onClick: () => void; label: string }> = ({
  children,
  onClick,
  label,
}) => (
  <button
    type="button"
    aria-label={label}
    onClick={(e) => {
      e.stopPropagation()
      onClick()
    }}
    className="flex flex-col items-start gap-0.5 text-left"
  >
    {children}
  </button>
)

/** Underline search input with a leading icon and a hidden label. */
export const SearchInput: React.FC<{
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
  className?: string
}> = ({ value, onChange, placeholder, label, className }) => (
  <label className={cn('relative flex min-h-11 items-center border-b border-ink focus-within:border-navy', className)}>
    <span className="sr-only">{label}</span>
    <Search className="pointer-events-none absolute left-0.5 h-4 w-4 text-muted" aria-hidden="true" />
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="min-h-11 w-full bg-transparent pl-7 pr-1 text-body text-ink placeholder:text-muted focus:outline-none focus-visible:outline-none"
    />
  </label>
)

/** "Showing 21–40 of 132" with Previous / Next. */
export const Pagination: React.FC<{
  page: number
  pageSize: number
  total: number
  onPage: (page: number) => void
  className?: string
}> = ({ page, pageSize, total, onPage, className }) => {
  if (total === 0) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  const last = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 pt-4', className)}>
      <span className="text-meta text-muted" aria-live="polite">
        {total <= pageSize ? `${total} ${total === 1 ? 'result' : 'results'}` : `Showing ${from}–${to} of ${total}`}
      </span>
      {last > 1 && (
        <span className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            Previous
          </Button>
          <Button size="sm" variant="secondary" disabled={page >= last} onClick={() => onPage(page + 1)}>
            Next
          </Button>
        </span>
      )}
    </div>
  )
}

/** A checkbox styled to the system (navy when checked). */
export const Checkbox: React.FC<
  { label: string; checked: boolean; indeterminate?: boolean; onChange: (checked: boolean) => void }
> = ({ label, checked, indeterminate, onChange }) => (
  <input
    type="checkbox"
    aria-label={label}
    checked={checked}
    ref={(el) => {
      if (el) el.indeterminate = Boolean(indeterminate)
    }}
    onClick={(e) => e.stopPropagation()}
    onChange={(e) => onChange(e.target.checked)}
    className="h-4 w-4 cursor-pointer accent-navy"
  />
)

/** True while an element's content is wider than the element (for the scroll fade). */
export function useOverflowX<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [over, setOver] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setOver(el.scrollWidth > el.clientWidth + 1 && el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
    check()
    el.addEventListener('scroll', check, { passive: true })
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null
    ro?.observe(el)
    return () => {
      el.removeEventListener('scroll', check)
      ro?.disconnect()
    }
  }, [])
  return { ref, over }
}

/**
 * Filter tabs with counts: underline style, behaving as a group of toggle
 * buttons (aria-pressed) — they filter one list, they don't switch panels.
 */
export const FilterTabs = <T extends string>({
  value,
  onChange,
  tabs,
  label,
  className,
}: {
  value: T
  onChange: (value: T) => void
  tabs: { value: T; label: string; count?: number }[]
  label: string
  className?: string
}) => {
  const { ref, over } = useOverflowX<HTMLDivElement>()
  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className={cn('scrollbar-none flex flex-nowrap gap-5 overflow-x-auto overflow-y-hidden border-b border-line', over && 'fade-x', className)}
    >
      {tabs.map((t) => {
        const active = t.value === value
        return (
          <button
            key={t.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(t.value)}
            className={cn(
              '-mb-px inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-0.5 text-body transition-colors',
              active ? 'border-ink font-semibold text-ink' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {t.label}
            {t.count !== undefined && <span className="text-micro font-normal tabular-nums text-muted">{t.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
