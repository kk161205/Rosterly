export type UserAccountStatus = 'active' | 'inactive' | 'suspended' | 'invited';

export interface UserAccountItem {
  id: string | number;
  email: string;
  name: string;
  role: string;
  role_id?: string | number;
  department: string;
  status: UserAccountStatus;
  last_login?: string | null;
  active_sessions_count?: number;
  mfa_enabled?: boolean;
  created_at: string;
}

export interface UserFilters {
  status?: string;
  role?: string;
  department?: string;
  search?: string;
}

export interface InviteUserPayload {
  email: string;
  name: string;
  role: string;
  department: string;
  send_invitation_email?: boolean;
}

export interface UpdateUserPayload {
  name?: string;
  role?: string;
  department?: string;
  status?: UserAccountStatus;
}
