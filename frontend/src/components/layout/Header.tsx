import React from 'react'
import { Bell, Shield } from 'lucide-react'
import { UserRole } from '@/types/dashboard'
import { SearchInput, SelectDropdown } from '@/components/common/CommonUI'

interface HeaderProps {
  currentRole: UserRole
  baseRole?: UserRole
  onRoleChange: (role: UserRole) => void
  unreadCount?: number
  userName?: string
  userEmail?: string
}

const ALLOWED_ROLE_SWITCHES: Record<UserRole, UserRole[]> = {
  super_admin: ['super_admin', 'it_admin', 'hr_admin', 'manager', 'employee', 'auditor'],
  hr_admin: ['hr_admin', 'manager', 'employee'],
  it_admin: ['it_admin', 'manager', 'employee'],
  manager: ['manager', 'employee'],
  auditor: ['auditor', 'employee'],
  employee: ['employee'],
}

export const Header: React.FC<HeaderProps> = ({
  currentRole,
  baseRole,
  onRoleChange,
  unreadCount = 0,
  userName,
  userEmail = '',
}) => {
  const allRoles: { value: UserRole; label: string }[] = [
    { value: 'employee', label: 'Employee View' },
    { value: 'manager', label: 'Manager View' },
    { value: 'hr_admin', label: 'HR Admin View' },
    { value: 'it_admin', label: 'IT Admin View' },
    { value: 'super_admin', label: 'Super Admin View' },
    { value: 'auditor', label: 'Auditor View' },
  ]

  const effectiveBase = baseRole || currentRole
  const allowedKeys = ALLOWED_ROLE_SWITCHES[effectiveBase] || [currentRole]
  const availableRoles = allRoles.filter((r) => allowedKeys.includes(r.value))

  const initialLetter = userName ? userName.charAt(0).toUpperCase() : ''

  return (
    <header className="h-16 bg-surface-container-lowest border-b border-outline-variant px-6 flex items-center justify-between sticky top-0 z-20 flex-shrink-0">
      {/* Global Search Bar via CommonUI */}
      <div className="w-80 md:w-96">
        <SearchInput placeholder="Search assets, employees, or requests..." />
      </div>

      {/* Header Right Actions */}
      <div className="flex items-center gap-4">
        {/* Role Context Switcher via CommonUI */}
        <SelectDropdown
          label="Role"
          icon={<Shield className="w-3.5 h-3.5" />}
          value={currentRole}
          onChange={(val) => onRoleChange(val as UserRole)}
          options={availableRoles}
        />

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
