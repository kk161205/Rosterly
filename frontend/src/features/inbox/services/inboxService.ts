import { apiClient } from '@/lib/api-client'
import type { InboxResponse } from '@/features/inbox/types/inbox'

/**
 * The Inbox reads from one endpoint and acts through the owning modules'
 * endpoints, so their rules and audit logging stay the source of truth.
 */
export const inboxService = {
  /** GET /inbox (§5.2a) */
  async getInbox(): Promise<InboxResponse> {
    const { data } = await apiClient.get<InboxResponse>('/inbox')
    return data
  },

  /** POST /requests/{id}/approve (§5.12) */
  async approveRequest(requestId: string, comments?: string): Promise<void> {
    await apiClient.post(`/requests/${requestId}/approve`, comments ? { comments } : {})
  },

  /** POST /requests/{id}/reject (§5.12) — a reason is required */
  async rejectRequest(requestId: string, comments: string): Promise<void> {
    await apiClient.post(`/requests/${requestId}/reject`, { comments })
  },

  /** PATCH /onboarding|offboarding/{checklist_id}/items/{item_id} (§5.5, §5.6) */
  async updateChecklistItem(
    type: 'onboarding' | 'offboarding',
    checklistId: string,
    itemId: string,
    status: 'pending' | 'in_progress' | 'done',
  ): Promise<void> {
    await apiClient.patch(`/${type}/${checklistId}/items/${itemId}`, { status })
  },

  /** PATCH /maintenance-tickets/{id} (§5.10) */
  async updateTicket(ticketId: string, changes: { status?: string; assigned_to?: string }): Promise<void> {
    await apiClient.patch(`/maintenance-tickets/${ticketId}`, changes)
  },
}
