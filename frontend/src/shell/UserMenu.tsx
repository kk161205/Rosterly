import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as Menu from '@radix-ui/react-dropdown-menu'
import { ChevronsUpDown } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { authService } from '@/features/auth/services/authService'
import { rolesLabel, rolesOf } from '@/features/auth/hooks/useCurrentUser'
import type { UserProfile } from '@/features/auth/types/auth'
import { authStorage } from '@/lib/authStorage'
import { Skeleton } from '@/ui'

const itemClass =
  'flex min-h-9 cursor-pointer select-none items-center rounded-soft px-3 text-body text-ink outline-none data-[highlighted]:bg-row-hover'

/** Name and role, opening profile and the two sign-out options (§5.1 logout endpoints). */
export const UserMenu: React.FC<{ user: UserProfile | null; onNavigate?: () => void }> = ({ user, onNavigate }) => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [signingOut, setSigningOut] = useState(false)

  const signOut = async (everywhere: boolean) => {
    setSigningOut(true)
    try {
      await (everywhere ? authService.logoutAllDevices() : authService.logout())
    } catch {
      // The session may already be gone; clearing locally is still correct
    } finally {
      authStorage.clearTokens()
      queryClient.clear()
      navigate('/login', { replace: true })
    }
  }

  if (!user) {
    return (
      <div className="flex flex-col gap-1.5 px-3 py-2" aria-hidden="true">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-3 w-16" />
      </div>
    )
  }

  return (
    <Menu.Root>
      <Menu.Trigger
        className="flex w-full items-center gap-2 rounded-card px-3 py-2 text-left transition-colors hover:bg-row-hover data-[state=open]:bg-row-hover"
        disabled={signingOut}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-body font-medium text-ink">{user.full_name}</span>
          <span className="truncate text-meta text-muted">{rolesLabel(rolesOf(user))}</span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          side="top"
          align="start"
          sideOffset={6}
          className="z-50 w-[var(--radix-dropdown-menu-trigger-width)] min-w-56 rounded-card border border-line bg-paper p-1.5"
        >
          <div className="px-3 pb-2 pt-1.5 text-meta text-muted">{user.email}</div>
          <Menu.Item
            className={itemClass}
            onSelect={() => {
              onNavigate?.()
              navigate('/profile')
            }}
          >
            Your profile
          </Menu.Item>
          <Menu.Separator className="my-1.5 h-px bg-line" />
          <Menu.Item className={itemClass} onSelect={() => signOut(false)}>
            Sign out
          </Menu.Item>
          <Menu.Item className={itemClass} onSelect={() => signOut(true)}>
            Sign out of all devices
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}
