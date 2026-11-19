import { apiClient } from '@/lib/api-client'
import type {
  MarkAllReadResponse,
  NotificationCategory,
  NotificationItem,
  NotificationListResponse,
} from '@/features/notifications/types/notifications'

export const notificationService = {
  async list(params?: {
    unread_only?: boolean
    category?: NotificationCategory
    page?: number
    page_size?: number
  }): Promise<NotificationListResponse> {
    return (await apiClient.get<NotificationListResponse>('/notifications', { params })).data
  },

  async markRead(id: string): Promise<NotificationItem> {
    return (await apiClient.patch<NotificationItem>(`/notifications/${id}/read`)).data
  },

  async markAllRead(): Promise<MarkAllReadResponse> {
    return (await apiClient.post<MarkAllReadResponse>('/notifications/mark-all-read')).data
  },
}
