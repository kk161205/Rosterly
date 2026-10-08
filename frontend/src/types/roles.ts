export interface PermissionItem {
  id: string | number;
  code: string;
  name: string;
  module: string;
  description?: string;
  is_danger?: boolean;
}

export interface PermissionGroup {
  module: string;
  permissions: PermissionItem[];
}

export interface RoleWithPermissions {
  id: string | number;
  name: string;
  description?: string;
  is_system?: boolean;
  user_count?: number;
  permissions: string[]; // array of permission codes
  created_at: string;
  updated_at?: string;
}

export interface CreateRolePayload {
  name: string;
  description?: string;
  permissions: string[];
}

export interface UpdateRolePermissionsPayload {
  permissions: string[];
}
