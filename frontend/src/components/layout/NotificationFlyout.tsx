import React, { useEffect, useState, useCallback } from 'react'
import { BellOff, AlertCircle, CheckCheck, RefreshCw } from 'lucide-react'
import { Button, StatusBadge } from '@/components/common/CommonUI'
import { notificationsService } from '@/services/notificationsService'
import { AppNotification } from '@/types/notifications'

interface NotificationFlyoutProps {
  isOpen: boolean
  onUnreadCountChange?: (count: number) => void
}

function formatRelativeTime(iso: string): string {
  const created = new Date(iso).getTime()
  if (Number.isNaN(created)) return ''
  const diffMs = Date.now() - created
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}d ago`
}

/**
 * Notification Hub flyout preview drawer (PRD §4, §5.16).
 * Real GET /notifications, PATCH /notifications/{id}/read and
 * POST /notifications/mark-all-read wiring — no fabricated notification data.
 */
export const NotificationFlyout: React.FC<NotificationFlyoutProps> = ({
  isOpen,
  onUnreadCountChange,
}) => {
  const [items, setItems] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isMarkingAll, setIsMarkingAll] = useState(false)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)

  const loadNotifications = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await notificationsService.getNotifications({ page: 1 })
      setItems(data.items)
      setUnreadCount(data.unread_count)
      onUnreadCountChange?.(data.unread_count)
    } catch {
      setError('Unable to load notifications from server. Please check your connection and try again.')
    } finally {
      setIsLoading(false)
      setHasLoadedOnce(true)
    }
  }, [onUnreadCountChange])

  useEffect(() => {
    if (isOpen && !hasLoadedOnce) {
      loadNotifications()
    }
  }, [isOpen, hasLoadedOnce, loadNotifications])

  const handleMarkOneRead = async (id: string) => {
    const target = items.find((item) => item.id === id)
    if (!target || target.is_read) return
    // Optimistic update, reconciled from the real PATCH response.
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, is_read: true } : item)))
    setUnreadCount((prev) => Math.max(0, prev - 1))
    try {
      const updated = await notificationsService.markAsRead(id)
      setItems((prev) => prev.map((item) => (item.id === id ? updated : item)))
    } catch {
      // Reconcile with server truth rather than trusting the optimistic guess.
      loadNotifications()
    }
  }

  const handleMarkAllRead = async () => {
    if (unreadCount === 0 || isMarkingAll) return
    setIsMarkingAll(true)
    try {
      await notificationsService.markAllRead()
      setItems((prev) => prev.map((item) => ({ ...item, is_read: true })))
      setUnreadCount(0)
      onUnreadCountChange?.(0)
    } catch {
      setError('Failed to mark all notifications as read. Please retry.')
    } finally {
      setIsMarkingAll(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      role="menu"
      aria-label="Notifications"
      className="absolute right-0 top-full mt-2 w-[360px] bg-surface-container-lowest border border-outline-variant rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100"
    >
      {/* Flyout Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant">
        <div className="flex items-center gap-2">
          <span className="text-title-md font-sans text-on-surface">Notifications</span>
          {unreadCount > 0 && <StatusBadge status={`${unreadCount} unread`} variant="info" dot={false} />}
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={<CheckCheck className="w-3.5 h-3.5" />}
          onClick={handleMarkAllRead}
          disabled={unreadCount === 0 || isMarkingAll}
        >
          Mark all read
        </Button>
      </div>

      {/* Body: loading / error / empty / list states (rules.md §2.3, §2.1) */}
      <div className="max-h-96 overflow-y-auto">
        {isLoading && (
          <div className="p-3 space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 rounded-md bg-surface-container-low animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && error && (
          <div className="p-6 flex flex-col items-center gap-3 text-center">
            <AlertCircle className="w-6 h-6 text-error" />
            <span className="text-body-sm text-on-surface-variant">{error}</span>
            <Button variant="outline" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={loadNotifications}>
              Retry
            </Button>
          </div>
        )}

        {!isLoading && !error && items.length === 0 && (
          <div className="p-8 flex flex-col items-center gap-2 text-center">
            <BellOff className="w-6 h-6 text-outline" />
            <span className="text-body-sm text-on-surface-variant">You're all caught up.</span>
          </div>
        )}

        {!isLoading && !error && items.length > 0 && (
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => handleMarkOneRead(item.id)}
                  className={`w-full text-left px-4 py-3 border-b border-outline-variant/60 last:border-b-0 transition-colors hover:bg-surface-container-low cursor-pointer ${
                    !item.is_read ? 'border-l-2 border-l-accent bg-accent-container/20' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-sans font-semibold text-on-surface leading-tight">
                      {item.title}
                    </span>
                    <span className="text-[10px] font-mono text-outline whitespace-nowrap flex-shrink-0">
                      {formatRelativeTime(item.created_at)}
                    </span>
                  </div>
                  <p className="text-[11px] font-body text-on-surface-variant mt-0.5 line-clamp-2">
                    {item.message}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
