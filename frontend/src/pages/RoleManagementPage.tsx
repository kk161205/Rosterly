import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  Plus,
  Save,
  Users,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { ZeroTrustNoticeBanner } from '../components/roles/ZeroTrustNoticeBanner';
import { PermissionMatrixGrid } from '../components/roles/PermissionMatrixGrid';
import { AddRoleModal } from '../components/roles/AddRoleModal';
import { roleManagementService } from '../services/roleManagementService';
import type {
  RoleWithPermissions,
  PermissionGroup,
  CreateRolePayload,
} from '../types/roles';

export const RoleManagementPage: React.FC = () => {
  const [roles, setRoles] = useState<RoleWithPermissions[]>([]);
  const [permissionGroups, setPermissionGroups] = useState<PermissionGroup[]>([]);
  const [selectedRole, setSelectedRole] = useState<RoleWithPermissions | null>(null);
  const [selectedPermissionCodes, setSelectedPermissionCodes] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Modal
  const [isAddRoleOpen, setIsAddRoleOpen] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [rolesData, permsData] = await Promise.all([
        roleManagementService.getRoles(),
        roleManagementService.getPermissions(),
      ]);

      setRoles(rolesData);
      setPermissionGroups(permsData);

      if (rolesData.length > 0 && !selectedRole) {
        setSelectedRole(rolesData[0]);
        setSelectedPermissionCodes(rolesData[0].permissions || []);
      } else if (selectedRole) {
        const current = rolesData.find((r) => r.id === selectedRole.id);
        if (current) {
          setSelectedRole(current);
          setSelectedPermissionCodes(current.permissions || []);
        }
      }
    } catch (err: any) {
      console.error('Failed to load RBAC configuration', err);
      setError(err?.response?.data?.detail || err?.message || 'Failed to load roles and permissions');
    } finally {
      setLoading(false);
    }
  }, [selectedRole]);

  useEffect(() => {
    fetchData();
  }, []);

  const handleSelectRole = (role: RoleWithPermissions) => {
    setSelectedRole(role);
    setSelectedPermissionCodes(role.permissions || []);
    setSaveSuccess(false);
  };

  const handleTogglePermission = (code: string) => {
    if (selectedRole?.is_system) return;
    setSelectedPermissionCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
    setSaveSuccess(false);
  };

  const handleToggleModuleAll = (group: PermissionGroup) => {
    if (selectedRole?.is_system) return;
    const groupCodes = group.permissions.map((p) => p.code);
    const allSelected = groupCodes.every((c) => selectedPermissionCodes.includes(c));

    if (allSelected) {
      setSelectedPermissionCodes((prev) => prev.filter((c) => !groupCodes.includes(c)));
    } else {
      setSelectedPermissionCodes((prev) => Array.from(new Set([...prev, ...groupCodes])));
    }
    setSaveSuccess(false);
  };

  const handleSavePermissions = async () => {
    if (!selectedRole || selectedRole.is_system) return;
    try {
      setSaving(true);
      setError(null);
      await roleManagementService.updateRolePermissions(selectedRole.id, {
        permissions: selectedPermissionCodes,
      });
      setSaveSuccess(true);
      await fetchData();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to save permissions');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateRole = async (payload: CreateRolePayload) => {
    const created = await roleManagementService.createRole(payload);
    await fetchData();
    setSelectedRole(created);
    setSelectedPermissionCodes(created.permissions || []);
  };

  const handleDeleteRole = async (roleId: string | number) => {
    if (!window.confirm('Are you sure you want to delete this custom role?')) return;
    try {
      setLoading(true);
      await roleManagementService.deleteRole(roleId);
      setSelectedRole(null);
      await fetchData();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to delete role');
      setLoading(false);
    }
  };

  const isDirty =
    selectedRole &&
    JSON.stringify([...selectedPermissionCodes].sort()) !==
      JSON.stringify([...(selectedRole.permissions || [])].sort());

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Shield className="w-7 h-7 text-primary" />
            Role & Permission Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure system roles, fine-grained access policies, and permission matrix scopes.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchData()}
            className="p-2.5 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh permissions"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setIsAddRoleOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm shadow-md hover:bg-primary/90 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Create Custom Role</span>
          </button>
        </div>
      </div>

      {/* Zero Trust Banner */}
      <ZeroTrustNoticeBanner />

      {error && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {saveSuccess && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>Role permissions updated successfully across all active cluster nodes.</span>
        </div>
      )}

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Role Selector List */}
        <div className="lg:col-span-4 space-y-3">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider px-1">
            Configured System & Custom Roles
          </h3>

          <div className="space-y-2">
            {roles.map((role) => {
              const isSelected = selectedRole?.id === role.id;
              return (
                <div
                  key={role.id}
                  onClick={() => handleSelectRole(role)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-primary bg-primary/10 shadow-md ring-1 ring-primary/30'
                      : 'border-border bg-card hover:border-border/80 hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-foreground">{role.name}</span>
                      {role.is_system && (
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border flex items-center gap-1">
                          <Lock className="w-2.5 h-2.5" /> Built-in
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      <span>{role.user_count ?? 0}</span>
                    </div>
                  </div>

                  {role.description && (
                    <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                      {role.description}
                    </p>
                  )}

                  <div className="mt-3 pt-2.5 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{role.permissions?.length || 0} permissions granted</span>
                    {!role.is_system && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteRole(role.id);
                        }}
                        className="text-destructive hover:underline p-0.5"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Permission Matrix */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-card border border-border">
            <div>
              <h2 className="text-base font-bold text-foreground">
                {selectedRole ? selectedRole.name : 'Select a Role'}
              </h2>
              <p className="text-xs text-muted-foreground">
                {selectedRole?.is_system
                  ? 'System roles are immutable standard templates and cannot be edited.'
                  : 'Toggle checkboxes to grant or revoke specific granular operations.'}
              </p>
            </div>

            {!selectedRole?.is_system && (
              <button
                type="button"
                disabled={saving || !isDirty}
                onClick={handleSavePermissions}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all shadow-md active:scale-95 disabled:opacity-50"
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>{saving ? 'Saving...' : isDirty ? 'Save Changes' : 'Saved'}</span>
              </button>
            )}
          </div>

          <PermissionMatrixGrid
            groups={permissionGroups}
            selectedRole={selectedRole}
            selectedPermissionCodes={selectedPermissionCodes}
            isSystemRole={selectedRole?.is_system}
            onTogglePermission={handleTogglePermission}
            onToggleModuleAll={handleToggleModuleAll}
          />
        </div>
      </div>

      {/* Add Role Modal */}
      <AddRoleModal
        isOpen={isAddRoleOpen}
        onClose={() => setIsAddRoleOpen(false)}
        onSubmit={handleCreateRole}
      />
    </div>
  );
};
export default RoleManagementPage;
