import React from 'react'
import { Search, Bell, Shield, User as UserIcon } from 'lucide-react'
import { UserRole } from '@/types/dashboard'

interface HeaderProps {
  currentRole: UserRole
  onRoleChange: (role: UserRole) => void
  unreadCount?: number
  userName?: string
  userEmail?: string
}

export const Header: React.FC<HeaderProps> = ({
  currentRole,
  onRoleChange,
  unreadCount = 0,
  userName = 'Kushagra',
  userEmail = 'kushagra@rosterly.io',
}) => {
  const roles: { value: UserRole; label: string }[] = [
    { value: 'employee', label: 'Employee View' },
    { value: 'manager', label: 'Manager View' },
    { value: 'hr_admin', label: 'HR Admin View' },
    { value: 'it_admin', label: 'IT Admin View' },
    { value: 'super_admin', label: 'Super Admin View' },
    { value: 'auditor', label: 'Auditor View' },
  ]

  return (
    <header className="h-16 bg-surface-container-lowest border-b border-outline-variant px-6 flex items-center justify-between sticky top-0 z-20">
      {/* Global Search Bar */}
      <div className="flex items-center gap-3 w-96">
        <div className="relative w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
          <input
            type="text"
            placeholder="Search assets, employees, or requests (Ctrl + K)..."
            className="w-full pl-9 pr-4 py-1.5 text-xs font-body bg-surface-container-low border border-outline-variant rounded-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-all"
          />
        </div>
      </div>

      {/* Header Right Actions */}
      <div className="flex items-center gap-4">
        {/* Role Context Switcher */}
        <div className="flex items-center gap-2 bg-surface-container-low px-2.5 py-1 rounded-md border border-outline-variant">
          <Shield className="w-3.5 h-3.5 text-primary" />
          <span className="text-[11px] font-mono text-on-surface-variant uppercase tracking-wider hidden sm:inline">
            Role:
          </span>
          <select
            value={currentRole}
            onChange={(e) => onRoleChange(e.target.value as UserRole)}
            className="bg-transparent text-xs font-sans font-semibold text-primary focus:outline-none cursor-pointer"
          >
            {roles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        {/* Notifications Icon Badge */}
        <button
          className="relative p-2 rounded-sm text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors"
          title="Notifications"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-error ring-2 ring-surface-container-lowest" />
          )}
        </button>

        {/* Vertical Separator */}
        <div className="h-6 w-px bg-outline-variant" />

        {/* User Profile */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary-container text-on-primary flex items-center justify-center font-sans font-semibold text-xs border border-primary">
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="hidden md:flex flex-col text-left">
            <span className="text-xs font-sans font-semibold text-on-surface leading-tight">
              {userName}
            </span>
            <span className="text-[11px] font-mono text-on-surface-variant leading-tight">
              {userEmail}
            </span>
          </div>
        </div>
      </div>
    </header>
  )
}
