import React from 'react'
import { Bell } from 'lucide-react'
import { SearchInput } from '@/components/common/CommonUI'

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

  return (
    <header className="h-16 bg-surface-container-lowest border-b border-outline-variant px-6 flex items-center justify-between sticky top-0 z-20 flex-shrink-0">
      {/* Global Search Bar via CommonUI */}
      <div className="w-80 md:w-96">
        <SearchInput placeholder="Search assets, employees, or requests..." />
      </div>

      {/* Header Right Actions */}
      <div className="flex items-center gap-4">
        {/* Notifications Icon Badge */}
        <button
          className="relative p-2 rounded-md text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors cursor-pointer"
          title="Notifications"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-error ring-2 ring-surface-container-lowest" />
          )}
        </button>

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
    </header>
  )
}
