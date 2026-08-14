import React from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { UserRole } from '@/types/dashboard'

interface AppLayoutProps {
  currentRole: UserRole
  onRoleChange: (role: UserRole) => void
  unreadAlertsCount?: number
  children: React.ReactNode
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  currentRole,
  onRoleChange,
  unreadAlertsCount = 0,
  children,
}) => {
  return (
    <div className="flex min-h-screen bg-background font-body text-on-background antialiased selection:bg-accent-container selection:text-on-accent-container">
      {/* Navigation Sidebar */}
      <Sidebar currentRole={currentRole} unreadAlertsCount={unreadAlertsCount} />

      {/* Main Workspace Layout */}
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
        <Header
          currentRole={currentRole}
          onRoleChange={onRoleChange}
          unreadCount={unreadAlertsCount}
        />
        <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto space-y-6">
          {children}
        </main>
      </div>
    </div>
  )
}
