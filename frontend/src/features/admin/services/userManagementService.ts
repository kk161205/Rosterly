import { apiClient } from '@/lib/api-client'
import type { AccessPreview, AssignableRole, InvitePayload, ManagedUser, UserListResponse } from '@/features/admin/types/users'

/** Accounts (§5.14): super admin and HR admin; role changes and force sign-out are super admin only. */
export const userManagementService = {
  async list(params: { search?: string; role_id?: string; status?: string; page: number; page_size: number }): Promise<UserListResponse> {
    return (await apiClient.get<UserListResponse>('/users', { params })).data
  },
  async assignableRoles(): Promise<AssignableRole[]> {
    return (await apiClient.get<AssignableRole[]>('/users/assignable-roles')).data
  },
  async invite(payload: InvitePayload): Promise<ManagedUser> {
    return (await apiClient.post<ManagedUser>('/users', payload)).data
  },
  /** Primary role plus additional roles (§5.14); the server checks conflicts and privileged roles. */
  async setRoles(id: string, roleId: string, additionalRoleIds: string[]): Promise<ManagedUser> {
    return (
      await apiClient.patch<ManagedUser>(`/users/${id}/role`, { role_id: roleId, additional_role_ids: additionalRoleIds })
    ).data
  },
  async accessPreview(roleIds: string[]): Promise<AccessPreview> {
    const params = new URLSearchParams()
    roleIds.forEach((id) => params.append('role_ids', id))
    return (await apiClient.get<AccessPreview>('/users/access-preview', { params })).data
  },
  async setStatus(id: string, status: 'active' | 'inactive'): Promise<ManagedUser> {
    return (await apiClient.patch<ManagedUser>(`/users/${id}/status`, { status })).data
  },
  async forceLogout(id: string): Promise<void> {
    await apiClient.post(`/users/${id}/force-logout`)
  },
}
