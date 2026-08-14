import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Box,
  CheckSquare,
  Wrench,
  ShieldCheck,
  Settings,
  Bell,
  LogOut,
  ChevronRight,
} from 'lucide-react'
import { authStorage } from '@/utils/authStorage'
import { UserRole } from '@/types/dashboard'

interface SidebarProps {
  currentRole: UserRole
  activeTab?: string
  unreadAlertsCount?: number
  collapsed?: boolean
  isLoading?: boolean
  onToggleCollapse?: () => void
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentRole,
  unreadAlertsCount = 0,
  isLoading = false,
}) => {
  const location = useLocation()

  if (isLoading) {
    return (
      <aside className="w-60 h-screen bg-primary text-on-primary flex flex-col justify-between border-r border-primary-container shadow-sm select-none flex-shrink-0 sticky top-0 overflow-y-auto animate-pulse">
        <div className="flex-1 flex flex-col min-h-0">
          {/* Brand Header Skeleton */}
          <div className="h-16 px-5 flex items-center gap-3 border-b border-primary-container/60 flex-shrink-0">
            <div className="w-8 h-8 rounded-md bg-primary-container/80" />
            <div className="space-y-1.5">
              <div className="w-20 h-4 rounded bg-primary-container/80" />
              <div className="w-14 h-2.5 rounded bg-primary-container/60" />
            </div>
          </div>

          {/* Role Identity Tag Skeleton */}
          <div className="px-4 py-2.5 mx-3 my-3 rounded-md bg-primary-container/40 border border-primary-container/40 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary-container/80" />
              <div className="w-20 h-3 rounded bg-primary-container/80" />
            </div>
            <div className="w-8 h-3 rounded bg-primary-container/60" />
          </div>

          {/* Primary Navigation Links Skeleton */}
          <div className="px-3 space-y-2 flex-1 pt-1">
            <div className="w-24 h-3 mx-3 mb-2 rounded bg-primary-container/60" />
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-3 py-2.5 rounded-md bg-primary-container/30"
              >
                <div className="w-4 h-4 rounded bg-primary-container/80" />
                <div className="w-28 h-4 rounded bg-primary-container/80" />
              </div>
            ))}
          </div>
        </div>

        {/* Footer Skeleton */}
        <div className="p-3 border-t border-primary-container/60 space-y-2 flex-shrink-0 bg-primary">
          <div className="w-full h-9 rounded-md bg-primary-container/40" />
        </div>
      </aside>
    )
  }

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, roleAccess: ['employee', 'manager', 'hr_admin', 'it_admin', 'super_admin', 'auditor'] },
    { name: 'Employees', path: '/employees', icon: Users, roleAccess: ['manager', 'hr_admin', 'super_admin', 'auditor'] },
    { name: 'Asset Inventory', path: '/assets', icon: Box, roleAccess: ['employee', 'manager', 'it_admin', 'super_admin', 'auditor'] },
    { name: 'Approvals Queue', path: '/approvals', icon: CheckSquare, badge: 'P0', roleAccess: ['manager', 'hr_admin', 'super_admin'] },
    { name: 'Maintenance & Tickets', path: '/maintenance', icon: Wrench, roleAccess: ['it_admin', 'super_admin'] },
    { name: 'Audit & Compliance', path: '/audit', icon: ShieldCheck, roleAccess: ['super_admin', 'auditor'] },
    { name: 'System Settings', path: '/settings', icon: Settings, roleAccess: ['super_admin'] },
  ]

  const filteredNav = navItems.filter((item) => item.roleAccess.includes(currentRole))

  return (
    <aside className="w-60 h-screen bg-primary text-on-primary flex flex-col justify-between border-r border-primary-container shadow-sm select-none flex-shrink-0 sticky top-0 overflow-y-auto">
      <div className="flex-1 flex flex-col min-h-0">
        {/* Brand Header */}
        <div className="h-16 px-5 flex items-center justify-between border-b border-primary-container/60 flex-shrink-0">
          <Link to="/dashboard" className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center text-on-accent font-sans font-bold text-lg shadow-sm group-hover:bg-accent-container group-hover:text-on-accent-container transition-colors">
              R
            </div>
            <div className="flex flex-col">
              <span className="font-sans font-semibold text-base leading-tight tracking-tight text-white">
                Rosterly
              </span>
              <span className="font-mono text-[10px] text-on-primary-container tracking-wider uppercase">
                Enterprise
              </span>
            </div>
          </Link>
        </div>

        {/* Role Identity Tag */}
        <div className="px-4 py-2.5 mx-3 my-3 rounded-md bg-primary-container/50 border border-primary-container text-xs flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
            <span className="font-mono text-label-caps text-on-primary-container uppercase truncate">
              {currentRole.replace('_', ' ')}
            </span>
          </div>
          <span className="font-mono text-[10px] text-inverse-primary bg-primary/60 px-1.5 py-0.5 rounded">
            v1.0
          </span>
        </div>

        {/* Primary Navigation Links */}
        <nav className="px-3 space-y-1 flex-1 overflow-y-auto">
          <div className="px-3 py-1.5 text-[11px] font-mono text-inverse-primary/80 uppercase tracking-wider">
            Workspace Nav
          </div>

          {filteredNav.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.path || (item.path === '/dashboard' && location.pathname === '/')
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-primary-container text-white shadow-inner font-semibold border-l-2 border-accent'
                    : 'text-inverse-primary hover:bg-primary-container/40 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-accent' : 'text-inverse-primary'}`} />
                  <span>{item.name}</span>
                </div>
                {item.badge && (
                  <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-accent-container text-on-accent-container">
                    {item.badge}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Footer / Alerts / Logout (Locked at viewport bottom) */}
      <div className="p-3 border-t border-primary-container/60 space-y-2 flex-shrink-0 bg-primary">
        {unreadAlertsCount > 0 && (
          <div className="flex items-center justify-between px-3 py-2 rounded-md bg-accent/20 border border-accent/30 text-xs text-on-primary">
            <div className="flex items-center gap-2">
              <Bell className="w-3.5 h-3.5 text-accent" />
              <span className="font-body text-xs">{unreadAlertsCount} Unread Alerts</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-inverse-primary" />
          </div>
        )}

        <button
          onClick={() => {
            authStorage.clearTokens()
            window.location.href = '/login'
          }}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-inverse-primary hover:bg-error/20 hover:text-red-200 transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4 text-inverse-primary" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  )
}
