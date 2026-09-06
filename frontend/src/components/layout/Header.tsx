import React, { useEffect, useRef, useState } from 'react'
import { Bell, Sparkles, ShieldCheck } from 'lucide-react'
import { SearchInput } from '@/components/common/CommonUI'
import { NotificationFlyout } from './NotificationFlyout'
import { AIAssistantPanel } from './AIAssistantPanel'

interface HeaderProps {
  unreadCount?: number
  userName?: string
  userEmail?: string
}

export const Header: React.FC<HeaderProps> = ({
  unreadCount = 0,
  userName,
  userEmail = '',
}) => {
  const initialLetter = userName ? userName.charAt(0).toUpperCase() : ''
  const searchInputRef = useRef<HTMLInputElement>(null)
  const notificationsRef = useRef<HTMLDivElement>(null)

  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(false)
  const [liveUnreadCount, setLiveUnreadCount] = useState(unreadCount)

  // Keep the flyout's live unread count in sync with the dashboard-sourced prop
  // (e.g. after navigating between pages), but let flyout mutations win in between.
  useEffect(() => {
    setLiveUnreadCount(unreadCount)
  }, [unreadCount])

  // Global Command Search keyboard shortcut (PRD §4: Ctrl+K / Cmd+K)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k'
      if (isShortcut) {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Close the notifications flyout on outside click
  useEffect(() => {
    if (!isNotificationsOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isNotificationsOpen])

  const shortcutLabel = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || '') ? '⌘K' : 'Ctrl+K'

  return (
    <header className="h-16 bg-surface/80 backdrop-blur-md border-b border-outline-variant/40 px-6 flex items-center justify-between sticky top-0 z-20 flex-shrink-0">
      {/* Global Command Search */}
      <div className="w-80 md:w-96">
        <SearchInput
          ref={searchInputRef}
          placeholder="Search assets, employees, or requests..."
          shortcut={shortcutLabel}
        />
      </div>

      {/* Header Right Actions */}
      <div className="flex items-center gap-3">
        {/* Zero-Trust Session Indicator (PRD §4 / §2) */}
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success-container border border-success/20">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success" />
          </span>
          <ShieldCheck className="w-3 h-3 text-on-success-container" />
          <span className="text-[10px] font-mono font-medium text-on-success-container tracking-wide uppercase">
            Zero-Trust Session Active
          </span>
        </div>

        {/* AI Assistant Trigger (PRD §4, opens §8.4.2 slide-over) */}
        <button
          type="button"
          onClick={() => setIsAIPanelOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent-container border border-accent/30 text-on-accent-container text-xs font-sans font-semibold hover:bg-accent/15 hover:shadow-[0_8px_24px_rgba(31,43,103,0.08)] transition-all cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-accent" />
          <span className="hidden sm:inline">Ask Rosterly AI</span>
        </button>

        {/* Vertical Separator */}
        <div className="h-6 w-px bg-outline-variant" />

        {/* Notification Hub */}
        <div className="relative" ref={notificationsRef}>
          <button
            className="relative p-2 rounded-md text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors cursor-pointer"
            title="Notifications"
            aria-haspopup="menu"
            aria-expanded={isNotificationsOpen}
            onClick={() => setIsNotificationsOpen((prev) => !prev)}
          >
            <Bell className="w-4 h-4" />
            {liveUnreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-error ring-2 ring-surface-container-lowest" />
            )}
          </button>
          <NotificationFlyout isOpen={isNotificationsOpen} onUnreadCountChange={setLiveUnreadCount} />
        </div>

        {/* Vertical Separator */}
        <div className="h-6 w-px bg-outline-variant" />

        {/* User Profile Tag */}
        <div className="flex items-center gap-2.5">
          {userName ? (
            <div className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center font-sans font-semibold text-xs shadow-xs">
              {initialLetter}
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-surface-container-high animate-pulse" />
          )}

          <div className="hidden md:flex flex-col text-left">
            {userName ? (
              <span className="text-xs font-sans font-semibold text-on-surface leading-tight">
                {userName}
              </span>
            ) : (
              <div className="h-3 w-24 bg-surface-container-high rounded animate-pulse mb-1" />
            )}
            {userEmail ? (
              <span className="text-[11px] font-mono text-on-surface-variant leading-tight">
                {userEmail}
              </span>
            ) : (
              <div className="h-2.5 w-32 bg-surface-container-high rounded animate-pulse" />
            )}
          </div>
        </div>
      </div>

      <AIAssistantPanel isOpen={isAIPanelOpen} onClose={() => setIsAIPanelOpen(false)} />
    </header>
  )
}
