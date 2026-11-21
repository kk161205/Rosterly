import React from 'react'
import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import type { NotificationItem as NotificationItemType } from '@/features/notifications/types/notifications'
import { getNotificationDeepLink } from '@/features/notifications/lib/notificationDeepLink'
import { formatShortDate } from '@/lib/format'
import { cn } from '@/ui'

interface NotificationItemProps {
  notification: NotificationItemType
  /** Older items show the date as well as the time. */
  showDate?: boolean
  onMarkRead?: (id: string) => void
  onNavigate?: () => void
}

/** One notification: title (links to the record), message, time. Unread = navy dot and bold title. */
export const NotificationItem: React.FC<NotificationItemProps> = ({ notification, showDate = false, onMarkRead, onNavigate }) => {
  const targetUrl = getNotificationDeepLink(notification.related_entity_type, notification.related_entity_id, notification.type)
  const time = new Date(notification.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const unread = !notification.is_read

  return (
    <article
      aria-label={notification.title}
      className="flex items-start justify-between gap-4 border-b border-line-soft py-3 transition-colors last:border-b-0"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          className={cn('mt-2 h-2 w-2 shrink-0 rounded-full', unread ? 'bg-navy' : 'bg-transparent')}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <Link
            to={targetUrl}
            onClick={onNavigate}
            className={cn('text-body text-ink hover:underline', unread ? 'font-semibold' : 'font-normal')}
          >
            {notification.title}
            {unread && <span className="sr-only"> (unread)</span>}
          </Link>
          <p className="mt-0.5 line-clamp-2 text-body text-muted">{notification.message}</p>
          <p className="mt-1 text-meta text-muted">
            <time dateTime={notification.created_at}>{showDate ? `${formatShortDate(notification.created_at)}, ${time}` : time}</time>
            {notification.is_critical && <span className="font-medium text-status-bad"> · Important</span>}
          </p>
        </div>
      </div>

      {unread && onMarkRead && (
        <button
          type="button"
          onClick={() => onMarkRead(notification.id)}
          aria-label="Mark notification as read"
          className="flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-pill text-muted hover:bg-row-hover hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2"
        >
          <Check className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </article>
  )
}
