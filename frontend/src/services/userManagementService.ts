import { apiClient } from '@/lib/api-client';
import type {
  UserAccountItem,
  UserFilters,
  InviteUserPayload,
  UpdateUserPayload,
} from '../types/users';

export const userManagementService = {
  /**
   * Fetches paginated/filtered list of tenant users.
   */
  async getUsers(filters: UserFilters = {}): Promise<UserAccountItem[]> {
    const params = new URLSearchParams();
    if (filters.status && filters.status !== 'all') params.append('status', filters.status);
    if (filters.role && filters.role !== 'all') params.append('role', filters.role);
    if (filters.department && filters.department !== 'all') params.append('department', filters.department);
    if (filters.search) params.append('search', filters.search);

    const response = await apiClient.get<UserAccountItem[]>(`/users?${params.toString()}`);
    return response.data;
  },

  /**
   * Invites / provisions a new corporate user account.
   */
  async inviteUser(payload: InviteUserPayload): Promise<UserAccountItem> {
    const response = await apiClient.post<UserAccountItem>('/users/invite', payload);
    return response.data;
  },

  /**
   * Updates user role, status or department.
   */
  async updateUser(
    userId: string | number,
    payload: UpdateUserPayload
  ): Promise<UserAccountItem> {
    const response = await apiClient.patch<UserAccountItem>(`/users/${userId}`, payload);
    return response.data;
  },

  /**
   * Force-revokes all active refresh tokens and active HTTP sessions for a user.
   */
  async forceLogoutUser(userId: string | number): Promise<{ revoked_sessions: number }> {
    const response = await apiClient.post<{ revoked_sessions: number }>(
      `/users/${userId}/force-logout`
    );
    return response.data;
  },

  /**
   * Deactivates or suspends a user account.
   */
  async suspendUser(userId: string | number): Promise<UserAccountItem> {
    const response = await apiClient.post<UserAccountItem>(`/users/${userId}/suspend`);
    return response.data;
  },

  /**
   * Reactivates a suspended user account.
   */
  async reactivateUser(userId: string | number): Promise<UserAccountItem> {
    const response = await apiClient.post<UserAccountItem>(`/users/${userId}/reactivate`);
    return response.data;
  },
};
