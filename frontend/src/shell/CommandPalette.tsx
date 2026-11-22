import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as RadixDialog from '@radix-ui/react-dialog'
import { Loader2, Mic, Search, Square } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { UserProfile } from '@/features/auth/types/auth'
import { hasPermission, hasRole } from '@/features/auth/hooks/useCurrentUser'
import type { VisibleSection } from '@/shell/nav'
import { matchPages, pagesFor } from '@/guide/pageMap'
import { useVoiceInput } from '@/guide/voice'
import { cn } from '@/ui'

/**
 * Search or ask (Ctrl K, "/", or the logo's tile): jump to
 * any page the caller can open, or find a person or an asset by name, code or
 * tag. Pages are matched by the page map's words, with no AI call. When the
 * Guide is allowed, the last row is always "Ask Rosterly: …".
 * People and assets come from the list endpoints, so the API's scoping applies.
 */
interface Result {
  id: string
  group: 'Pages' | 'People' | 'Assets' | 'Guide'
  label: string
  detail?: string
  /** Where it goes; empty for the "Ask Rosterly" row. */
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
  /** The Guide is allowed (company + person). */
  canAsk?: boolean
  onAsk?: (question: string) => void
  /** Voice input is on for this person and the browser can record. */
  canSpeak?: boolean
}> = ({ open, onOpenChange, sections, user, canAsk = false, onAsk, canSpeak = false }) => {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  // What was said goes into the box to check and send — never straight to the Guide.
  const voice = useVoiceInput((text) => setQuery(text))
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

  // Anyone's profile: HR, admins and auditors; others search the directory instead.
  const canOpenProfiles = hasRole(user, 'super_admin', 'hr_admin', 'auditor')
  const results = useMemo<Result[]>(() => {
    const q = query.trim()
    const pages: Result[] = q
      ? matchPages(q, pagesFor(user).filter((p) => p.navigable)).map(({ page }) => ({
          id: `page:${page.route}`,
          group: 'Pages' as const,
          label: page.section && page.tab ? `${page.section} · ${page.tab}` : page.title,
          detail: page.purpose,
          path: page.route,
        }))
      : sections.flatMap((s) =>
          s.links.map((l) => ({
            id: `page:${l.path}`,
            group: 'Pages' as const,
            label: l.label === s.label ? s.label : `${s.label} · ${l.label}`,
            path: l.path,
          })),
        )
    const found: Result[] = searchable
      ? [
          ...(people.data ?? []).map((p) => ({
            id: `person:${p.id}`,
            group: 'People' as const,
            label: p.full_name,
            detail: [p.designation, p.department_name].filter(Boolean).join(' · '),
            // Profiles need employee:read; without it the directory search is the way in
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
    const askRow: Result[] =
      canAsk && q.length >= 2 ? [{ id: 'ask', group: 'Guide' as const, label: `Ask Rosterly: “${q}”`, path: '' }] : []
    return [...pages, ...found, ...askRow]
  }, [query, sections, searchable, people.data, assets.data, canOpenProfiles, canAsk, user])

  useEffect(() => setCursor(0), [query])
  const cancelVoice = voice.cancel // stable; the voice object itself changes every render
  useEffect(() => {
    if (open) return
    setQuery('')
    cancelVoice() // closing the box discards a recording in progress
  }, [open, cancelVoice])

  const go = (r: Result | undefined) => {
    if (!r) return
    if (r.group === 'Guide') {
      onAsk?.(query.trim()) // the Guide closes the box itself
      return
    }
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
          <RadixDialog.Title className="sr-only">{canAsk ? 'Search or ask Rosterly' : 'Search Rosterly'}</RadixDialog.Title>
          <RadixDialog.Description className="sr-only">
            {canAsk
              ? 'Type to find a page, a person or an asset, or ask how to do something. Use the arrow keys and Enter; the last result asks the Guide.'
              : 'Type to find a page, a person or an asset. Use the arrow keys and Enter to open a result.'}
          </RadixDialog.Description>
          <div className="flex items-center gap-3 border-b border-line px-5">
            <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={canAsk ? 'Search, or ask how to do something' : 'Search pages, people and assets'}
              aria-label={canAsk ? 'Search or ask' : 'Search'}
              role="combobox"
              aria-expanded="true"
              aria-controls="palette-results"
              aria-activedescendant={activeId}
              className="min-h-14 flex-1 bg-transparent text-lead text-ink placeholder:text-muted focus:outline-none"
            />
            {canSpeak && canAsk && (
              <button
                type="button"
                onClick={() => (voice.state === 'listening' ? voice.stop() : voice.start())}
                disabled={voice.state === 'working' || voice.state === 'starting'}
                aria-label={voice.state === 'listening' ? 'Stop listening' : 'Speak instead of typing'}
                aria-pressed={voice.state === 'listening'}
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-pill transition-colors focus-visible:outline-navy',
                  voice.state === 'listening' ? 'bg-navy text-paper' : 'text-muted hover:bg-row-hover hover:text-ink',
                )}
              >
                {voice.state === 'working' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : voice.state === 'listening' ? <Square className="h-3.5 w-3.5" aria-hidden="true" /> : <Mic className="h-4 w-4" aria-hidden="true" />}
              </button>
            )}
          </div>
          {canSpeak && canAsk && (voice.state !== 'idle' || voice.error) && (
            <p role="status" className="border-b border-line px-5 py-2 text-meta text-muted">
              {voice.state === 'listening' ? 'Listening… press the square when you’re done.' : voice.state === 'working' ? 'Turning that into text…' : voice.error}
            </p>
          )}
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
                  <span className={cn('truncate', r.group === 'Guide' && 'font-medium text-navy')}>{r.label}</span>
                  {r.detail && (
                    <span className={cn('min-w-0 truncate text-meta text-muted', r.group === 'Assets' && 'shrink-0 font-mono', r.group === 'Pages' && 'hidden sm:inline')}>
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
