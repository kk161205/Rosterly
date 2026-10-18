import React, { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useCurrentUser } from '@/features/auth/hooks/useCurrentUser'
import { InboxDetail, type InboxActions } from '@/features/inbox/components/InboxDetail'
import { InboxList, entryId, orderEntries } from '@/features/inbox/components/InboxList'
import { INBOX_KEY, useInbox } from '@/features/inbox/hooks/useInbox'
import { inboxService } from '@/features/inbox/services/inboxService'
import { getErrorMessage } from '@/lib/errors'
import { ErrorState, SidePanel, Skeleton } from '@/ui'

const KIND_LABEL = { approval: 'Approval', task: 'Task', ticket: 'Ticket' } as const

function useIsWide(): boolean {
  const query = '(min-width: 1280px)'
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setWide(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])
  return wide
}

/**
 * "Waiting on you" — the Inbox (§5.2a) as a section of Home: everything
 * waiting on the caller in one list, the selected item's context and actions
 * beside it. Finishing an item opens the next one. Below 1280px the detail
 * opens in a side panel.
 */
export const InboxSection: React.FC = () => {
  const { user } = useCurrentUser()
  const inbox = useInbox(Boolean(user))
  const queryClient = useQueryClient()
  const wide = useIsWide()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)

  const entries = useMemo(
    () => (inbox.data ? orderEntries(inbox.data.items, inbox.data.done_today) : []),
    [inbox.data],
  )
  const openCount = inbox.data?.items.length ?? 0
  const doneCount = inbox.data?.done_today.length ?? 0

  // Keep a valid selection on wide screens: the first open item by default
  useEffect(() => {
    if (!wide || entries.length === 0) return
    if (!selectedId || !entries.some((e) => entryId(e) === selectedId)) {
      const firstOpen = entries.find((e) => e.type === 'open') ?? entries[0]
      setSelectedId(entryId(firstOpen))
    }
  }, [entries, selectedId, wide])

  const selected = entries.find((e) => entryId(e) === selectedId) ?? null

  /** After an action: move to the next open item, then refresh the list. */
  const finish = async (currentId: string) => {
    const open = entries.filter((e) => e.type === 'open')
    const index = open.findIndex((e) => entryId(e) === currentId)
    const next = open[index + 1] ?? open[index - 1]
    setSelectedId(next ? entryId(next) : null)
    if (!wide) setPanelOpen(false)
    await queryClient.invalidateQueries({ queryKey: INBOX_KEY })
  }

  const actions: InboxActions = {
    approve: async (requestId) => {
      await inboxService.approveRequest(requestId)
      await finish(`approval:${requestId}`)
    },
    reject: async (requestId, reason) => {
      await inboxService.rejectRequest(requestId, reason)
      await finish(`approval:${requestId}`)
    },
    setTaskStatus: async (task, status) => {
      await inboxService.updateChecklistItem(task.checklist_type, task.checklist_id, task.item_id, status)
      if (status === 'done') await finish(`task:${task.item_id}`)
      else await queryClient.invalidateQueries({ queryKey: INBOX_KEY })
    },
    updateTicket: async (ticket, { status, take }) => {
      await inboxService.updateTicket(ticket.ticket_id, {
        ...(status ? { status } : {}),
        ...(take && user ? { assigned_to: user.id } : {}),
      })
      if (status === 'resolved') await finish(`ticket:${ticket.ticket_id}`)
      else await queryClient.invalidateQueries({ queryKey: INBOX_KEY })
    },
  }

  const select = (id: string) => {
    setSelectedId(id)
    if (!wide) setPanelOpen(true)
  }

  const summary = !inbox.data
    ? ''
    : openCount === 0
      ? doneCount
        ? `Nothing open · ${doneCount} done today`
        : 'Nothing open'
      : `${openCount} open${doneCount ? ` · ${doneCount} done today` : ''}`

  const detail = selected && <InboxDetail {...selected} actions={actions} />

  return (
    <section id="waiting" aria-labelledby="waiting-heading" className="flex scroll-mt-8 flex-col border-t border-ink xl:flex-row xl:gap-10">
      <div className="min-w-0 max-w-2xl xl:w-96 xl:max-w-none xl:shrink-0">
        <div className="flex items-baseline justify-between gap-3 px-3 pt-4">
          <h2 id="waiting-heading" className="text-section text-ink">
            Waiting on you
          </h2>
          <p className="text-meta text-muted" aria-live="polite">
            {summary}
          </p>
        </div>

        {inbox.isLoading || !user ? (
          <div className="mt-6 flex flex-col gap-4 px-3" aria-label="Loading inbox">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : inbox.isError ? (
          <ErrorState
            className="px-3"
            message={getErrorMessage(inbox.error, 'Your inbox could not be loaded.')}
            onRetry={() => inbox.refetch()}
          />
        ) : entries.length === 0 ? (
          <p className="max-w-sm px-3 py-6 text-body text-muted">
            Approvals, tasks and tickets appear here as soon as they’re assigned to you.
          </p>
        ) : (
          <InboxList entries={entries} selectedId={selectedId} onSelect={select} />
        )}
      </div>

      {wide && entries.length > 0 && (
        <div aria-label="Selected item" role="region" className="min-w-0 flex-1 border-l border-line-soft pl-10 pt-5">
          {/* The column stretches so the divider runs the full list height; the detail stays in view */}
          <div className="sticky top-8 max-w-2xl">{detail}</div>
        </div>
      )}

      {!wide && selected && (
        <SidePanel
          open={panelOpen}
          onOpenChange={setPanelOpen}
          title={selected.type === 'done' ? 'Done today' : KIND_LABEL[selected.item.kind]}
          hideTitle
        >
          {detail}
        </SidePanel>
      )}
    </section>
  )
}
