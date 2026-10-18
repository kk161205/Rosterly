// /users (§5.14)

import type { RoleRef } from '@/features/admin/types/roles'

export interface ManagedUser {
  id: string
  employee_code: string
  full_name: string
  email: string
  role_id: string
  /** Primary role. */
  role_name: string
  /** §5.14 multi-role; effective access is the union with the primary role. */
  additional_roles: RoleRef[]
  department_id: string | null
  department_name: string | null
  designation: string
  status: string
  last_login_at: string | null
  created_at: string | null
}

export interface UserListResponse {
  items: ManagedUser[]
  total: number
  page: number
  page_size: number
}

export interface AssignableRole {
  id: string
  name: string
  description: string | null
  is_system_role: boolean
}

/** GET /users/access-preview — what a set of roles merges into. */
export interface AccessPreview {
  permissions: { permission: string; description: string | null; roles: string[] }[]
  conflicts: [string, string][]
}

export interface InvitePayload {
  full_name: string
  email: string
  role_id: string
  department_id?: string
  designation?: string
  date_of_joining?: string
}
