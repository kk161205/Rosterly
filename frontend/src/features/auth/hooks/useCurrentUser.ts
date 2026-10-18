import { useQuery } from '@tanstack/react-query'
import { authService } from '@/features/auth/services/authService'
import type { UserProfile } from '@/features/auth/types/auth'

export const CURRENT_USER_KEY = ['auth', 'me'] as const

/**
 * The signed-in user from GET /auth/me — live role and "resource:action"
 * permissions. Frontend gating is convenience only (§3.2); the API enforces.
 */
export function useCurrentUser() {
  const query = useQuery({
    queryKey: CURRENT_USER_KEY,
    queryFn: authService.getCurrentUser,
    staleTime: 5 * 60_000,
  })
  return { ...query, user: query.data ?? null, can: (permission: string) => hasPermission(query.data, permission) }
}

export function hasPermission(user: UserProfile | null | undefined, permission: string): boolean {
  return Boolean(user?.permissions?.includes(permission))
}

/** Every role the user holds, primary first (§5.14 multi-role). */
export function rolesOf(user: UserProfile | null | undefined): string[] {
  if (!user) return []
  return user.roles?.length ? user.roles : [user.role]
}

/** Whether the user holds any of `names`, as primary or additional role. */
export function hasRole(user: UserProfile | null | undefined, ...names: string[]): boolean {
  return rolesOf(user).some((r) => names.includes(r))
}

/** "HR admin + Manager" — every role held, primary first. */
export function rolesLabel(roles: string[]): string {
  return roles.map(roleLabel).join(' + ')
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super admin',
  it_admin: 'IT admin',
  hr_admin: 'HR admin',
  manager: 'Manager',
  employee: 'Employee',
  auditor: 'Auditor',
}

/** "IT admin" from "it_admin"; custom roles are humanised. */
export function roleLabel(role: string | null | undefined): string {
  if (!role) return ''
  return ROLE_LABELS[role] ?? role.charAt(0).toUpperCase() + role.slice(1).replace(/_/g, ' ')
}
