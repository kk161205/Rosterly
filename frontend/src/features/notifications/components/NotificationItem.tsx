import React from 'react'
import { Link } from 'react-router-dom'
import { Check, Clock, Laptop, ShieldCheck, User } from 'lucide-react'
import type { NotificationItem as NotificationItemType } from '@/features/notifications/types/notifications'
import { getNotificationDeepLink } from '@/features/notifications/lib/notificationDeepLink'
import { cn } from '@/ui'

interface NotificationItemProps {
  notification: NotificationItemType
  onMarkRead?: (id: string) => void
  onNavigate?: () => void
}

function getCategoryIcon(type: string) {
  if (type.includes('approval') || type.includes('request')) {
    return <User className="h-4 w-4 text-navy" aria-hidden="true" />
  }
  if (type.includes('warranty') || type.includes('hardware') || type.includes('license')) {
    return <Laptop className="h-4 w-4 text-status-warn" aria-hidden="true" />
  }
  return <ShieldCheck className="h-4 w-4 text-muted" aria-hidden="true" />
}

export const NotificationItem: React.FC<NotificationItemProps> = ({
  notification,
  onMarkRead,
  onNavigate,
}) => {
  const targetUrl = getNotificationDeepLink(
    notification.related_entity_type,
    notification.related_entity_id,
  )

  const timeString = new Date(notification.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <article
      aria-label={notification.title}
      className={cn(
        'group relative flex items-start justify-between gap-4 border-b border-line-soft px-4 py-3.5 transition-colors',
        !notification.is_read
          ? 'border-l-4 border-l-navy bg-navy-tint/30'
          : 'bg-paper hover:bg-ground/50',
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="mt-0.5 shrink-0 rounded-pill bg-ground p-1.5">
          {getCategoryIcon(notification.type)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              to={targetUrl}
              onClick={onNavigate}
              className="text-body font-medium text-ink hover:underline focus:outline-none"
            >
              {notification.title}
            </Link>
            {!notification.is_read && (
              <span className="inline-block h-2 w-2 rounded-full bg-navy" title="Unread" />
            )}
          </div>
          <p className="mt-0.5 text-body text-muted line-clamp-2">{notification.message}</p>
          <div className="mt-1.5 flex items-center gap-2 text-micro text-muted">
            <Clock className="h-3 w-3" aria-hidden="true" />
            <time dateTime={notification.created_at}>{timeString}</time>
            {notification.is_critical && (
              <span className="font-medium text-status-bad">Critical alert</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {!notification.is_read && onMarkRead && (
          <button
            type="button"
            onClick={() => onMarkRead(notification.id)}
            title="Mark as read"
            aria-label="Mark notification as read"
            className="rounded-pill p-1.5 text-muted hover:bg-ground hover:text-ink focus:outline-none focus:ring-2 focus:ring-navy"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </article>
  )
}
