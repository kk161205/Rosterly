import React, { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { DoneItem, InboxItem, InboxKind } from '@/features/inbox/types/inbox'
import { formatAge } from '@/lib/format'
import { cn } from '@/ui'

/** A row in the list: either something waiting, or something finished today. */
type ListEntry = { type: 'open'; item: InboxItem } | { type: 'done'; item: DoneItem }

export const entryId = (e: ListEntry) => (e.type === 'open' ? e.item.id : `done:${e.item.id}`)

const GROUPS: { kind: InboxKind; label: string }[] = [
  { kind: 'approval', label: 'Needs your decision' },
  { kind: 'task', label: 'Your tasks' },
  { kind: 'ticket', label: 'Tickets' },
]

const dotClass: Record<InboxKind, string> = {
  approval: 'bg-navy',
  task: 'bg-status-warn',
  ticket: 'bg-status-bad',
}

const CLUSTER_NOUN: Record<InboxKind, string> = { approval: 'requests', task: 'people', ticket: 'tickets' }

/** Entries in display order — also the order "finish one, open the next" follows. */
export function orderEntries(items: InboxItem[], done: DoneItem[]): ListEntry[] {
  return [
    ...GROUPS.flatMap((g) => items.filter((i) => i.kind === g.kind).map((item) => ({ type: 'open' as const, item }))),
    ...done.map((item) => ({ type: 'done' as const, item })),
  ]
}

/** A run of open items sharing a title (the same checklist step for many people) shows as one row. */
type Row = { type: 'single'; entry: ListEntry } | { type: 'cluster'; key: string; title: string; entries: ListEntry[] }

function toRows(entries: ListEntry[]): Row[] {
  const byTitle = new Map<string, ListEntry[]>()
  for (const e of entries) {
    // Same step regardless of case or spacing ("Manager orientation" vs "Manager Orientation")
    const key = e.type === 'open' ? `${e.item.kind}:${e.item.title.trim().toLowerCase().replace(/\s+/g, ' ')}` : entryId(e)
    byTitle.set(key, [...(byTitle.get(key) ?? []), e])
  }
  return [...byTitle.entries()].map(([key, group]) =>
    group.length > 1 && group[0].type === 'open'
      ? { type: 'cluster', key, title: group[0].item.title, entries: group }
      : { type: 'single', entry: group[0] },
  )
}

/** Inside a cluster the title is shared, so each row leads with the person instead. */
function clusterChild(entry: ListEntry): { title: string; meta: string } {
  if (entry.type === 'open' && entry.item.task) {
    const name = entry.item.task.employee.full_name
    return { title: name, meta: entry.item.meta.replace(` · ${name}`, '') }
  }
  return { title: entry.item.title, meta: entry.type === 'open' ? entry.item.meta : entry.item.outcome }
}

const EntryButton: React.FC<{
  entry: ListEntry
  selected: boolean
  onSelect: (id: string) => void
  title: string
  meta: string
  nested?: boolean
}> = ({ entry, selected, onSelect, title, meta, nested }) => {
  const done = entry.type === 'done'
  return (
    <button
      type="button"
      onClick={() => onSelect(entryId(entry))}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'flex w-full items-start gap-3 rounded-card py-3 pr-3 text-left transition-colors',
        nested ? 'pl-10' : 'pl-3',
        selected ? 'bg-row-selected' : 'hover:bg-row-hover',
      )}
    >
      {!nested && (
        <span
          className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', done ? 'bg-control' : dotClass[entry.item.kind])}
          aria-hidden="true"
        />
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn('truncate text-body font-medium', done ? 'text-muted' : 'text-ink')}>{title}</span>
        <span className="truncate text-meta text-muted">{meta}</span>
      </span>
      <span className="shrink-0 pt-0.5 text-micro tabular-nums text-muted">
        {formatAge(entry.type === 'done' ? entry.item.done_at : entry.item.created_at)}
      </span>
    </button>
  )
}

export const InboxList: React.FC<{
  entries: ListEntry[]
  selectedId: string | null
  onSelect: (id: string) => void
}> = ({ entries, selectedId, onSelect }) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const groups = [
    ...GROUPS.map((g) => ({
      label: g.label,
      rows: toRows(entries.filter((e) => e.type === 'open' && e.item.kind === g.kind)),
    })),
    { label: 'Done today', rows: toRows(entries.filter((e) => e.type === 'done')) },
  ].filter((g) => g.rows.length > 0)

  // A cluster holding the selected item opens so the selection stays visible
  useEffect(() => {
    if (!selectedId) return
    for (const g of groups)
      for (const r of g.rows)
        if (r.type === 'cluster' && r.entries.some((e) => entryId(e) === selectedId) && !expanded.has(r.key))
          setExpanded((prev) => new Set(prev).add(r.key))
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <div className="flex flex-col">
      {groups.map((group) => (
        <section key={group.label} aria-label={group.label} className="mt-6 first:mt-5">
          <h2 className="px-3 pb-1.5 text-meta font-medium text-muted">{group.label}</h2>
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {group.rows.map((row) => {
              if (row.type === 'single') {
                const e = row.entry
                return (
                  <li key={entryId(e)}>
                    <EntryButton
                      entry={e}
                      selected={entryId(e) === selectedId}
                      onSelect={onSelect}
                      title={e.item.title}
                      meta={e.type === 'done' ? e.item.outcome : e.item.meta}
                    />
                  </li>
                )
              }
              const open = expanded.has(row.key)
              const kind = row.entries[0].type === 'open' ? row.entries[0].item.kind : 'task'
              return (
                <li key={row.key}>
                  <button
                    type="button"
                    onClick={() => toggle(row.key)}
                    aria-expanded={open}
                    className="flex w-full items-start gap-3 rounded-card px-3 py-3 text-left transition-colors hover:bg-row-hover"
                  >
                    <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', dotClass[kind])} aria-hidden="true" />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="line-clamp-2 text-body font-medium text-ink">{row.title}</span>
                      <span className="text-meta text-muted">
                        {row.entries.length} {CLUSTER_NOUN[kind]}
                      </span>
                    </span>
                    <ChevronRight
                      className={cn('mt-0.5 h-4 w-4 shrink-0 text-muted transition-transform', open && 'rotate-90')}
                      aria-hidden="true"
                    />
                  </button>
                  {open && (
                    <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                      {row.entries.map((e) => {
                        const child = clusterChild(e)
                        return (
                          <li key={entryId(e)}>
                            <EntryButton
                              entry={e}
                              nested
                              selected={entryId(e) === selectedId}
                              onSelect={onSelect}
                              title={child.title}
                              meta={child.meta}
                            />
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
