import React, { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Bell, CheckCheck, ChevronRight } from 'lucide-react'
import {
  useNotificationMutations,
  useNotifications,
} from '@/features/notifications/hooks/useNotifications'
import { NotificationItem } from '@/features/notifications/components/NotificationItem'
import { cn } from '@/ui'

interface NotificationFlyoutProps {
  className?: string
  align?: 'left' | 'right'
  onNavigate?: () => void
}

export const NotificationFlyout: React.FC<NotificationFlyoutProps> = ({
  className,
  align = 'right',
  onNavigate,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const flyoutRef = useRef<HTMLDivElement>(null)

  const { data } = useNotifications({ page: 1, page_size: 5 })
  const { markRead, markAllRead } = useNotificationMutations()

  const items = data?.items?.slice(0, 5) || []
  const unreadCount = data?.unread_count ?? 0

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (flyoutRef.current && !flyoutRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick)
      document.addEventListener('keydown', handleEscape)
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  return (
    <div className={cn('relative inline-block', className)} ref={flyoutRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={`Notifications, ${unreadCount} unread`}
        aria-expanded={isOpen}
        className="relative flex min-h-10 min-w-10 items-center justify-center rounded-pill text-muted transition-colors hover:bg-row-hover hover:text-ink focus:outline-none focus:ring-2 focus:ring-navy"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-pill bg-navy px-1 font-sans text-micro font-medium text-paper">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Notification center preview"
          className={cn(
            'absolute top-full z-50 mt-2 w-80 sm:w-96 rounded-card border border-line bg-paper shadow-lg focus:outline-none',
            align === 'left' ? 'left-0' : 'right-0',
          )}
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-body font-semibold text-ink">Notifications</span>
              {unreadCount > 0 && (
                <span className="rounded-pill bg-navy-tint px-2 py-0.5 text-micro font-medium text-navy">
                  {unreadCount} unread
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="flex items-center gap-1 text-micro text-muted hover:text-ink focus:outline-none"
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          <div className="max-h-80 divide-y divide-line-soft overflow-y-auto">
            {items.length === 0 ? (
              <div className="p-6 text-center text-body text-muted">
                No notifications right now
              </div>
            ) : (
              items.map((item) => (
                <NotificationItem
                  key={item.id}
                  notification={item}
                  onMarkRead={(id) => markRead.mutate(id)}
                  onNavigate={() => {
                    setIsOpen(false)
                    onNavigate?.()
                  }}
                />
              ))
            )}
          </div>

          <div className="border-t border-line bg-ground/50 p-2 text-center">
            <Link
              to="/notifications"
              onClick={() => {
                setIsOpen(false)
                onNavigate?.()
              }}
              className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-body font-medium text-navy hover:underline focus:outline-none"
            >
              <span>View all notifications</span>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
