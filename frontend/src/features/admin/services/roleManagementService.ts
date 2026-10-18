import { apiClient } from '@/lib/api-client'
import type { Permission, Role, RoleRef, RolePermissions } from '@/features/admin/types/roles'

/** Roles and the permission matrix (§5.13, super admin). */
export const roleManagementService = {
  async roles(): Promise<Role[]> {
    return (await apiClient.get<Role[]>('/roles')).data
  },
  async permissions(): Promise<Permission[]> {
    return (await apiClient.get<Permission[]>('/permissions')).data
  },
  async rolePermissions(roleId: string): Promise<RolePermissions> {
    return (await apiClient.get<RolePermissions>(`/roles/${roleId}/permissions`)).data
  },
  async savePermissions(roleId: string, permissionIds: string[]): Promise<RolePermissions> {
    return (await apiClient.put<RolePermissions>(`/roles/${roleId}/permissions`, { permission_ids: permissionIds })).data
  },
  async create(name: string, description?: string): Promise<Role> {
    return (await apiClient.post<Role>('/roles', { name, description: description || null })).data
  },
  /** Roles this role can't be combined with (§5.14); refused while someone holds both. */
  async saveConflicts(roleId: string, roleIds: string[]): Promise<RoleRef[]> {
    return (await apiClient.put<RoleRef[]>(`/roles/${roleId}/conflicts`, { role_ids: roleIds })).data
  },
  async remove(roleId: string): Promise<void> {
    await apiClient.delete(`/roles/${roleId}`)
  },
}
