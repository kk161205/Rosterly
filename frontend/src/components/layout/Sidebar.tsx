import React, { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  UserPlus,
  UserMinus,
  Box,
  CheckSquare,
  Wrench,
  ShieldCheck,
  Settings,
  Bell,
  LogOut,
  ChevronRight,
  UserCog,
  Lock,
  ChevronUp,
} from 'lucide-react'
import { authStorage } from '@/utils/authStorage'
import { UserRole } from '@/types/dashboard'
import { StatusBadge } from '@/components/common/CommonUI'

interface SidebarProps {
  currentRole: UserRole
  unreadAlertsCount?: number
  userName?: string
  userEmail?: string
}

interface NavItem {
  name: string
  path: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
  roleAccess: UserRole[]
}

interface NavGroup {
  label: string
  items: NavItem[]
}

// PRD §4 Global Frontend Shell Architecture — categorical navigation groups.
// Item -> group mapping is a judgment call made against what actually exists
// in the current nav list (see task report for the reasoning per group).
const NAV_GROUPS: NavGroup[] = [
  {
    label: 'CORE OPERATIONS',
    items: [
      { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, roleAccess: ['employee', 'manager', 'hr_admin', 'it_admin', 'super_admin', 'auditor'] },
      { name: 'Employees', path: '/employees', icon: Users, roleAccess: ['employee', 'manager', 'hr_admin', 'it_admin', 'super_admin', 'auditor'] },
    ],
  },
  {
    label: 'ASSET GOVERNANCE',
    items: [
      { name: 'Asset Inventory', path: '/assets', icon: Box, roleAccess: ['employee', 'manager', 'it_admin', 'super_admin', 'auditor'] },
      { name: 'Maintenance & Tickets', path: '/maintenance', icon: Wrench, roleAccess: ['it_admin', 'super_admin'] },
    ],
  },
  {
    label: 'WORKFLOWS & APPROVALS',
    items: [
      { name: 'Onboarding Workflow', path: '/onboarding', icon: UserPlus, roleAccess: ['hr_admin', 'it_admin', 'manager', 'super_admin'] },
      { name: 'Offboarding Workflow', path: '/offboarding', icon: UserMinus, roleAccess: ['hr_admin', 'it_admin', 'super_admin'] },
      { name: 'Approvals Queue', path: '/approvals', icon: CheckSquare, badge: 'P0', roleAccess: ['manager', 'hr_admin', 'super_admin'] },
    ],
  },
  {
    label: 'ADMINISTRATION',
    items: [
      { name: 'Audit & Compliance', path: '/audit', icon: ShieldCheck, roleAccess: ['super_admin', 'auditor'] },
      { name: 'System Settings', path: '/settings', icon: Settings, roleAccess: ['super_admin'] },
    ],
  },
]

export const Sidebar: React.FC<SidebarProps> = ({
  currentRole,
  unreadAlertsCount = 0,
  userName,
  userEmail,
}) => {
  const location = useLocation()
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isProfileMenuOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsProfileMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isProfileMenuOpen])

  const handleSignOut = () => {
    authStorage.clearTokens()
    window.location.href = '/login'
  }

  const initialLetter = userName ? userName.charAt(0).toUpperCase() : '?'

  return (
    <aside className="w-60 h-screen bg-primary text-on-primary flex flex-col justify-between border-r border-primary-container shadow-sm select-none flex-shrink-0 sticky top-0 overflow-y-auto">
      <div className="flex-1 flex flex-col min-h-0">
        {/* Brand & Workspace Header */}
        <div className="px-5 py-4 border-b border-primary-container/60 flex-shrink-0 space-y-3">
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

          {/* Workspace Indicator Pill (PRD §4) */}
          <div
            className="w-fit max-w-full px-2.5 py-1 rounded-full bg-primary-container/50 border border-primary-container flex items-center gap-1.5 overflow-hidden"
            title="Workspace"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-success flex-shrink-0" />
            <span className="font-mono text-[10px] text-on-primary-container tracking-wide truncate">
              Acme Enterprise &bull; SOC-2 Live
            </span>
          </div>
        </div>

        {/* Categorical Navigation Groups */}
        <nav className="px-3 py-3 space-y-4 flex-1 overflow-y-auto">
          {NAV_GROUPS.map((group) => {
            const visibleItems = group.items.filter((item) => item.roleAccess.includes(currentRole))
            if (visibleItems.length === 0) return null

            return (
              <div key={group.label}>
                <div className="px-3 pb-1.5 text-[11px] font-mono text-inverse-primary/70 uppercase tracking-wider">
                  {group.label}
                </div>
                <div className="space-y-1">
                  {visibleItems.map((item) => {
                    const Icon = item.icon
                    const isActive =
                      location.pathname === item.path ||
                      (item.path === '/dashboard' && location.pathname === '/')
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-md text-sm transition-all duration-150 ${
                          isActive
                            ? 'bg-accent/20 text-white font-medium border-l-2 border-accent'
                            : 'text-inverse-primary hover:bg-white/[0.08] hover:text-white border-l-2 border-transparent'
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
                </div>
              </div>
            )
          })}
        </nav>
      </div>

      {/* Footer: Alerts + Bottom Profile Card */}
      <div className="p-3 border-t border-primary-container/60 space-y-2 flex-shrink-0 bg-primary relative" ref={profileMenuRef}>
        {unreadAlertsCount > 0 && (
          <div className="flex items-center justify-between px-3 py-2 rounded-md bg-accent/20 border border-accent/30 text-xs text-on-primary">
            <div className="flex items-center gap-2">
              <Bell className="w-3.5 h-3.5 text-accent" />
              <span className="font-body text-xs">{unreadAlertsCount} Unread Alerts</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-inverse-primary" />
          </div>
        )}

        {/* Quick-action menu (profile settings, lock session, logout) */}
        {isProfileMenuOpen && (
          <div className="absolute bottom-full left-3 right-3 mb-2 bg-surface-container-lowest border border-outline-variant rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <Link
              to="/profile"
              onClick={() => setIsProfileMenuOpen(false)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-sans font-medium text-on-surface hover:bg-surface-container-low transition-colors cursor-pointer"
            >
              <UserCog className="w-3.5 h-3.5 text-on-surface-variant" />
              Profile Settings
            </Link>
            {/* PRD §2 (Zero-Trust Auth) defines logout / logout-all-devices but no
                distinct "lock session" concept — surfaced disabled rather than faked. */}
            <button
              type="button"
              disabled
              title="Session locking isn't available yet"
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-sans font-medium text-outline cursor-not-allowed"
            >
              <Lock className="w-3.5 h-3.5" />
              Lock Session
              <span className="ml-auto text-[9px] font-mono uppercase tracking-wide text-outline">Soon</span>
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-sans font-medium text-error hover:bg-error-container transition-colors cursor-pointer border-t border-outline-variant"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => setIsProfileMenuOpen((prev) => !prev)}
          aria-expanded={isProfileMenuOpen}
          aria-haspopup="menu"
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-white/[0.08] transition-colors cursor-pointer"
        >
          {userName ? (
            <div className="w-8 h-8 rounded-full bg-accent text-on-accent flex items-center justify-center font-sans font-semibold text-xs flex-shrink-0">
              {initialLetter}
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-primary-container animate-pulse flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0 text-left">
            {userName ? (
              <span className="block text-xs font-sans font-semibold text-white truncate">{userName}</span>
            ) : (
              <div className="h-3 w-24 bg-primary-container rounded animate-pulse mb-1" />
            )}
            <StatusBadge status={currentRole} variant="neutral" dot={false} className="mt-0.5" />
          </div>
          <ChevronUp
            className={`w-3.5 h-3.5 text-inverse-primary flex-shrink-0 transition-transform duration-150 ${
              isProfileMenuOpen ? '' : 'rotate-180'
            }`}
          />
        </button>
        {userEmail && (
          <span className="block px-2.5 text-[10px] font-mono text-inverse-primary/70 truncate" title={userEmail}>
            {userEmail}
          </span>
        )}
      </div>
    </aside>
  )
}
