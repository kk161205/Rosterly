// PRD §5.16 Notifications Center — `notifications` table (§1.15)
export type NotificationChannel = 'in_app' | 'email' | 'both'

export interface AppNotification {
  id: string
  user_id: string
  type: string
  title: string
  message: string
  related_entity_type?: string | null
  related_entity_id?: string | null
  channel: NotificationChannel
  is_critical: boolean
  email_sent_at?: string | null
  is_read: boolean
  created_at: string
}

export interface NotificationsListResponse {
  items: AppNotification[]
  unread_count: number
}

export interface MarkAllReadResponse {
  updated_count: number
}
