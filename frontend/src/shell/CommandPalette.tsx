import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as RadixDialog from '@radix-ui/react-dialog'
import { Search } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { UserProfile } from '@/features/auth/types/auth'
import { hasPermission } from '@/features/auth/hooks/useCurrentUser'
import type { VisibleSection } from '@/shell/nav'
import { cn } from '@/ui'

/**
 * Ctrl K (§4 shell): jump to any page the caller can open, or find a person
 * or an asset by name, code or tag. Results come from the list endpoints, so
 * the API's own scoping applies.
 */
interface Result {
  id: string
  group: 'Pages' | 'People' | 'Assets'
  label: string
  detail?: string
  path: string
}

interface PersonHit {
  id: string
  full_name: string
  employee_code: string
  designation: string
  department_name: string | null
}
interface AssetHit {
  id: string
  asset_tag: string
  name: string
}

function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

export const CommandPalette: React.FC<{
  open: boolean
  onOpenChange: (open: boolean) => void
  sections: VisibleSection[]
  user: UserProfile | null
}> = ({ open, onOpenChange, sections, user }) => {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const term = useDebounced(query.trim(), 200)
  const searchable = term.length >= 2

  const people = useQuery({
    queryKey: ['palette', 'people', term],
    queryFn: async () =>
      (await apiClient.get<{ items: PersonHit[] }>('/employees', { params: { search: term, page_size: 5 } })).data
        .items,
    enabled: open && searchable,
  })
  const assets = useQuery({
    queryKey: ['palette', 'assets', term],
    queryFn: async () =>
      (await apiClient.get<{ items: AssetHit[] }>('/assets', { params: { search: term, page_size: 5 } })).data.items,
    enabled: open && searchable && hasPermission(user, 'assets:read'),
  })

  const canOpenProfiles = hasPermission(user, 'employee:read')
  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase()
    const pages: Result[] = sections
      .flatMap((s) =>
        s.links.map((l) => ({
          id: `page:${l.path}`,
          group: 'Pages' as const,
          label: l.label === s.label ? s.label : `${s.label} · ${l.label}`,
          path: l.path,
        })),
      )
      .filter((p) => !q || p.label.toLowerCase().includes(q))
    const found: Result[] = searchable
      ? [
          ...(people.data ?? []).map((p) => ({
            id: `person:${p.id}`,
            group: 'People' as const,
            label: p.full_name,
            detail: [p.designation, p.department_name].filter(Boolean).join(' · '),
            // Profiles need employee:read (§5.4); without it the directory search is the way in
            path: canOpenProfiles ? `/employees/${p.id}` : `/employees?search=${encodeURIComponent(p.full_name)}`,
          })),
          ...(assets.data ?? []).map((a) => ({
            id: `asset:${a.id}`,
            group: 'Assets' as const,
            label: a.name,
            detail: a.asset_tag,
            path: `/assets/${a.id}`,
          })),
        ]
      : []
    return [...pages, ...found]
  }, [query, sections, searchable, people.data, assets.data, canOpenProfiles])

  useEffect(() => setCursor(0), [query])
  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const go = (r: Result | undefined) => {
    if (!r) return
    onOpenChange(false)
    navigate(r.path)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(c + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(c - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(results[cursor])
    }
  }

  const loading = searchable && (people.isFetching || assets.isFetching)
  const activeId = results[cursor] ? `palette-${results[cursor].id}` : undefined

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-ink/30" />
        <RadixDialog.Content
          className="fixed left-1/2 top-[12vh] z-50 flex max-h-[70vh] w-[calc(100vw-32px)] max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-card bg-paper text-ink focus:outline-none"
          onKeyDown={onKeyDown}
        >
          <RadixDialog.Title className="sr-only">Search Rosterly</RadixDialog.Title>
          <RadixDialog.Description className="sr-only">
            Type to find a page, a person or an asset. Use the arrow keys and Enter to open a result.
          </RadixDialog.Description>
          <div className="flex items-center gap-3 border-b border-line px-5">
            <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search pages, people and assets"
              aria-label="Search"
              role="combobox"
              aria-expanded="true"
              aria-controls="palette-results"
              aria-activedescendant={activeId}
              className="min-h-14 flex-1 bg-transparent text-lead text-ink placeholder:text-muted focus:outline-none"
            />
          </div>
          <ul id="palette-results" role="listbox" aria-label="Results" className="m-0 list-none overflow-y-auto p-2">
            {results.map((r, i) => (
              <React.Fragment key={r.id}>
                {(i === 0 || results[i - 1].group !== r.group) && (
                  <li role="presentation" className="px-3 pb-1 pt-3 text-meta text-muted">
                    {r.group}
                  </li>
                )}
                <li
                  id={`palette-${r.id}`}
                  role="option"
                  aria-selected={i === cursor}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(r)}
                  className={cn(
                    'flex min-h-10 cursor-pointer items-center justify-between gap-4 rounded-soft px-3 text-body',
                    i === cursor && 'bg-row-hover',
                  )}
                >
                  <span className="truncate">{r.label}</span>
                  {r.detail && (
                    <span className={cn('shrink-0 text-meta text-muted', r.group === 'Assets' && 'font-mono')}>
                      {r.detail}
                    </span>
                  )}
                </li>
              </React.Fragment>
            ))}
            {results.length === 0 && !loading && (
              <li role="presentation" className="px-3 py-6 text-body text-muted">
                No pages, people or assets match “{query.trim()}”.
              </li>
            )}
            {loading && (
              <li role="presentation" className="px-3 py-3 text-meta text-muted">
                Searching…
              </li>
            )}
          </ul>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
