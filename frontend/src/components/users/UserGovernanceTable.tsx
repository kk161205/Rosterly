import React from 'react';
import {
  User,
  Shield,
  ShieldCheck,
  LogOut,
  Ban,
  RotateCcw,
  CheckCircle2,
  Clock,
  KeyRound,
  Inbox,
} from 'lucide-react';
import type { UserAccountItem, UserAccountStatus } from '../../types/users';

interface UserGovernanceTableProps {
  users: UserAccountItem[];
  loading: boolean;
  onForceLogout: (user: UserAccountItem) => void;
  onToggleSuspend: (user: UserAccountItem) => void;
  onChangeRole: (user: UserAccountItem, newRole: string) => void;
}

export const UserGovernanceTable: React.FC<UserGovernanceTableProps> = ({
  users,
  loading,
  onForceLogout,
  onToggleSuspend,
  onChangeRole,
}) => {
  const getStatusBadge = (status: UserAccountStatus) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" /> Active
          </span>
        );
      case 'suspended':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-destructive/10 text-destructive border border-destructive/20">
            <Ban className="w-3.5 h-3.5" /> Suspended
          </span>
        );
      case 'invited':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-500 border border-blue-500/20">
            <Clock className="w-3.5 h-3.5" /> Invited
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border">
            Inactive
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-muted/40 animate-pulse" />
        ))}
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
        <Inbox className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-60" />
        <h3 className="text-base font-semibold text-foreground">No Users Found</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
          No user accounts match the current filter or search criteria.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="py-3.5 px-4">User</th>
              <th className="py-3.5 px-4">Role</th>
              <th className="py-3.5 px-4">Department</th>
              <th className="py-3.5 px-4">Status</th>
              <th className="py-3.5 px-4">MFA</th>
              <th className="py-3.5 px-4">Last Active</th>
              <th className="py-3.5 px-4 text-right">Governance Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-sm">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-muted/40 transition-colors">
                <td className="py-4 px-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                      {user.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-semibold text-foreground">{user.name}</div>
                      <div className="text-xs text-muted-foreground">{user.email}</div>
                    </div>
                  </div>
                </td>

                <td className="py-4 px-4">
                  <select
                    value={user.role}
                    onChange={(e) => onChangeRole(user, e.target.value)}
                    className="px-2.5 py-1 rounded-lg border border-border bg-background text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="Admin">Admin</option>
                    <option value="Asset Manager">Asset Manager</option>
                    <option value="Department Manager">Department Manager</option>
                    <option value="Technician">Technician</option>
                    <option value="Employee">Employee</option>
                  </select>
                </td>

                <td className="py-4 px-4 text-xs font-medium text-foreground">
                  {user.department}
                </td>

                <td className="py-4 px-4">{getStatusBadge(user.status)}</td>

                <td className="py-4 px-4">
                  {user.mfa_enabled ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      <ShieldCheck className="w-3.5 h-3.5" /> Enforced
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Disabled</span>
                  )}
                </td>

                <td className="py-4 px-4 text-xs text-muted-foreground whitespace-nowrap">
                  {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}
                </td>

                <td className="py-4 px-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => onForceLogout(user)}
                      className="p-1.5 rounded-lg text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 border border-border transition-colors"
                      title="Force logout all active sessions"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => onToggleSuspend(user)}
                      className={`p-1.5 rounded-lg border transition-colors ${
                        user.status === 'suspended'
                          ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 border-emerald-500/20'
                          : 'text-destructive hover:bg-destructive/10 border-destructive/20'
                      }`}
                      title={user.status === 'suspended' ? 'Reactivate user' : 'Suspend user'}
                    >
                      {user.status === 'suspended' ? (
                        <RotateCcw className="w-4 h-4" />
                      ) : (
                        <Ban className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
