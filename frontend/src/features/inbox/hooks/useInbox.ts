import { useQuery } from '@tanstack/react-query'
import { inboxService } from '@/features/inbox/services/inboxService'

export const INBOX_KEY = ['inbox'] as const

/** Shared by the Inbox page and the sidebar count, so both read one cache entry. */
export function useInbox(enabled = true) {
  return useQuery({
    queryKey: INBOX_KEY,
    queryFn: inboxService.getInbox,
    enabled,
    refetchInterval: 60_000,
  })
}
