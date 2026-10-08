import { apiClient } from '@/lib/api-client';
import type {
  RoleWithPermissions,
  PermissionGroup,
  CreateRolePayload,
  UpdateRolePermissionsPayload,
} from '../types/roles';

export const roleManagementService = {
  /**
   * Fetches all defined system and custom roles with their permission assignments.
   */
  async getRoles(): Promise<RoleWithPermissions[]> {
    const response = await apiClient.get<RoleWithPermissions[]>('/roles');
    return response.data;
  },

  /**
   * Fetches all registered system permissions grouped by functional module.
   */
  async getPermissions(): Promise<PermissionGroup[]> {
    const response = await apiClient.get<PermissionGroup[]>('/permissions');
    return response.data;
  },

  /**
   * Creates a new custom RBAC role with selected permission codes.
   */
  async createRole(payload: CreateRolePayload): Promise<RoleWithPermissions> {
    const response = await apiClient.post<RoleWithPermissions>('/roles', payload);
    return response.data;
  },

  /**
   * Updates permission matrix assignments for an existing role.
   */
  async updateRolePermissions(
    roleId: string | number,
    payload: UpdateRolePermissionsPayload
  ): Promise<RoleWithPermissions> {
    const response = await apiClient.put<RoleWithPermissions>(
      `/roles/${roleId}/permissions`,
      payload
    );
    return response.data;
  },

  /**
   * Deletes a custom role (blocked if system role or has assigned users).
   */
  async deleteRole(roleId: string | number): Promise<void> {
    await apiClient.delete(`/roles/${roleId}`);
  },
};
