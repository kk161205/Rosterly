import React, { useEffect, useState } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { UserRole } from '@/types/dashboard'
import { SlowLoadingBanner } from '@/components/dashboard/DashboardSkeletons'

interface AppLayoutProps {
  currentRole: UserRole
  baseRole?: UserRole
  onRoleChange: (role: UserRole) => void
  unreadAlertsCount?: number
  userName?: string
  userEmail?: string
  isLoading?: boolean
  children: React.ReactNode
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  currentRole,
  baseRole,
  onRoleChange,
  unreadAlertsCount = 0,
  userName,
  userEmail,
  isLoading = false,
  children,
}) => {
  const [isSlowLoading, setIsSlowLoading] = useState(false)

  useEffect(() => {
    let timer: NodeJS.Timeout
    if (isLoading) {
      timer = setTimeout(() => {
        setIsSlowLoading(true)
      }, 2500)
    } else {
      setIsSlowLoading(false)
    }
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [isLoading])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background font-body text-on-background antialiased selection:bg-accent-container selection:text-on-accent-container">
      {/* Fixed Viewport Height Sidebar */}
      <Sidebar
        currentRole={currentRole}
        unreadAlertsCount={unreadAlertsCount}
        isLoading={isLoading}
      />

      {/* Main Workspace Layout with Independent Scrolling */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        <Header
          currentRole={currentRole}
          baseRole={baseRole}
          onRoleChange={onRoleChange}
          unreadCount={unreadAlertsCount}
          userName={userName}
          userEmail={userEmail}
        />
        <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto space-y-6">
          {isSlowLoading && <SlowLoadingBanner />}
          {children}
        </main>
      </div>
    </div>
  )
}
