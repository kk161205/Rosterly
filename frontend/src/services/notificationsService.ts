import { apiClient } from '@/lib/api-client'
import {
  AppNotification,
  NotificationsListResponse,
  MarkAllReadResponse,
} from '@/types/notifications'

export const notificationsService = {
  /**
   * GET /notifications (PRD §5.16)
   * Fetches the current user's self-scoped notification inbox.
   */
  async getNotifications(params?: { unread_only?: boolean; page?: number }): Promise<NotificationsListResponse> {
    const response = await apiClient.get<NotificationsListResponse>('/notifications', { params })
    return response.data
  },

  /**
   * PATCH /notifications/{id}/read (PRD §5.16)
   * Marks a single notification as read.
   */
  async markAsRead(id: string): Promise<AppNotification> {
    const response = await apiClient.patch<AppNotification>(`/notifications/${id}/read`)
    return response.data
  },

  /**
   * POST /notifications/mark-all-read (PRD §5.16)
   * Marks every unread notification for the current user as read.
   */
  async markAllRead(): Promise<MarkAllReadResponse> {
    const response = await apiClient.post<MarkAllReadResponse>('/notifications/mark-all-read')
    return response.data
  },
}
