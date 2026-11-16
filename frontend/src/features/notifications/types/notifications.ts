export type NotificationCategory = 'approvals' | 'hardware' | 'system'

export interface NotificationItem {
  id: string
  type: string
  title: string
  message: string
  related_entity_type: string | null
  related_entity_id: string | null
  is_critical: boolean
  is_read: boolean
  created_at: string
}

export interface NotificationListResponse {
  items: NotificationItem[]
  total: number
  unread_count: number
}

export interface MarkAllReadResponse {
  updated_count: number
}
