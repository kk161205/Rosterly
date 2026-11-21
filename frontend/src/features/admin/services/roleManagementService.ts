import { apiClient } from '@/lib/api-client'
import type { Role, RoleRef, RolePermissions } from '@/features/admin/types/roles'

/** The six fixed roles, what each can do, and role conflicts (super admin). */
export const roleManagementService = {
  async roles(): Promise<Role[]> {
    return (await apiClient.get<Role[]>('/roles')).data
  },
  async rolePermissions(roleId: string): Promise<RolePermissions> {
    return (await apiClient.get<RolePermissions>(`/roles/${roleId}/permissions`)).data
  },
  /** Roles this role can't be combined with; refused while someone holds both. */
  async saveConflicts(roleId: string, roleIds: string[]): Promise<RoleRef[]> {
    return (await apiClient.put<RoleRef[]>(`/roles/${roleId}/conflicts`, { role_ids: roleIds })).data
  },
}
