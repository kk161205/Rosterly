import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  UserPlus,
  RefreshCw,
  Search,
  Filter,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { UserGovernanceTable } from '../components/users/UserGovernanceTable';
import { InviteUserModal } from '../components/users/InviteUserModal';
import { ForceLogoutConfirmModal } from '../components/users/ForceLogoutConfirmModal';
import { userManagementService } from '../services/userManagementService';
import type {
  UserAccountItem,
  InviteUserPayload,
} from '../types/users';

export const UserManagementPage: React.FC = () => {
  const [users, setUsers] = useState<UserAccountItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');

  // Modals
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [forceLogoutUser, setForceLogoutUser] = useState<UserAccountItem | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await userManagementService.getUsers({
        role: roleFilter !== 'all' ? roleFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        department: departmentFilter !== 'all' ? departmentFilter : undefined,
        search: searchQuery.trim() || undefined,
      });
      setUsers(data);
    } catch (err: any) {
      console.error('Failed to load user accounts', err);
      setError(err?.response?.data?.detail || err?.message || 'Failed to load user accounts');
    } finally {
      setLoading(false);
    }
  }, [roleFilter, statusFilter, departmentFilter, searchQuery]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleInviteUser = async (payload: InviteUserPayload) => {
    await userManagementService.inviteUser(payload);
    setSuccessToast(`Invitation sent to ${payload.email} successfully.`);
    await fetchUsers();
  };

  const handleForceLogout = async (userId: string | number) => {
    const res = await userManagementService.forceLogoutUser(userId);
    setSuccessToast(`Revoked ${res.revoked_sessions ?? 1} active session(s).`);
    await fetchUsers();
  };

  const handleToggleSuspend = async (user: UserAccountItem) => {
    try {
      if (user.status === 'suspended') {
        await userManagementService.reactivateUser(user.id);
        setSuccessToast(`User ${user.name} has been reactivated.`);
      } else {
        if (!window.confirm(`Are you sure you want to suspend ${user.name}'s account?`)) return;
        await userManagementService.suspendUser(user.id);
        setSuccessToast(`User ${user.name} account suspended.`);
      }
      await fetchUsers();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Action failed');
    }
  };

  const handleChangeRole = async (user: UserAccountItem, newRole: string) => {
    try {
      await userManagementService.updateUser(user.id, { role: newRole });
      setSuccessToast(`Updated ${user.name}'s role to ${newRole}.`);
      await fetchUsers();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to update role');
    }
  };

  // Metrics
  const activeCount = users.filter((u) => u.status === 'active').length;
  const mfaEnforcedCount = users.filter((u) => u.mfa_enabled).length;

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Users className="w-7 h-7 text-primary" />
            User Management & Access Control
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Provision team members, enforce MFA policies, and oversee active session security.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchUsers()}
            className="p-2.5 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh users"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setIsInviteOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm shadow-md hover:bg-primary/90 transition-all active:scale-95"
          >
            <UserPlus className="w-4 h-4" />
            <span>Invite User</span>
          </button>
        </div>
      </div>

      {/* Success Notification */}
      {successToast && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>{successToast}</span>
          </div>
          <button
            onClick={() => setSuccessToast(null)}
            className="text-xs underline hover:opacity-80"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl border border-border bg-card shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">{users.length}</div>
            <div className="text-xs text-muted-foreground">Total Registered Users</div>
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-border bg-card shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">{activeCount}</div>
            <div className="text-xs text-muted-foreground">Active User Accounts</div>
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-border bg-card shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">{mfaEnforcedCount}</div>
            <div className="text-xs text-muted-foreground">2FA / MFA Enforced</div>
          </div>
        </div>
      </div>

      {/* Filters and Table */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name, email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-input bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="all">All Roles</option>
              <option value="Admin">Admin</option>
              <option value="Asset Manager">Asset Manager</option>
              <option value="Department Manager">Department Manager</option>
              <option value="Technician">Technician</option>
              <option value="Employee">Employee</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="invited">Invited</option>
              <option value="inactive">Inactive</option>
            </select>

            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="all">All Departments</option>
              <option value="Engineering">Engineering</option>
              <option value="Design">Design</option>
              <option value="Product">Product</option>
              <option value="Sales">Sales</option>
              <option value="Finance">Finance</option>
              <option value="HR & Operations">HR & Operations</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <UserGovernanceTable
          users={users}
          loading={loading}
          onForceLogout={(u) => setForceLogoutUser(u)}
          onToggleSuspend={handleToggleSuspend}
          onChangeRole={handleChangeRole}
        />
      </div>

      {/* Invite Modal */}
      <InviteUserModal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        onSubmit={handleInviteUser}
      />

      {/* Force Logout Confirm Modal */}
      <ForceLogoutConfirmModal
        isOpen={!!forceLogoutUser}
        user={forceLogoutUser}
        onClose={() => setForceLogoutUser(null)}
        onConfirm={handleForceLogout}
      />
    </div>
  );
};
export default UserManagementPage;
