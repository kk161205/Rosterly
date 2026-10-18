// /roles and /permissions (§5.13)

export interface RoleRef {
  id: string
  name: string
}

export interface Role {
  id: string
  name: string
  description: string | null
  is_system_role: boolean
  /** People holding it as primary or additional role (§5.14). */
  user_count: number
  /** Roles one person may not hold together with this one. */
  conflicts_with: RoleRef[]
  created_at: string | null
}

export interface Permission {
  id: string
  resource: string
  action: string
  description: string | null
}

export interface RolePermissions {
  role_id: string
  role_name: string
  permissions: Permission[]
}
