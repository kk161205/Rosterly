import React from 'react';
import { Check, Shield } from 'lucide-react';
import type { PermissionGroup, RoleWithPermissions } from '../../types/roles';

interface PermissionMatrixGridProps {
  groups: PermissionGroup[];
  selectedRole: RoleWithPermissions | null;
  selectedPermissionCodes: string[];
  isSystemRole?: boolean;
  onTogglePermission: (code: string) => void;
  onToggleModuleAll: (group: PermissionGroup) => void;
}

export const PermissionMatrixGrid: React.FC<PermissionMatrixGridProps> = ({
  groups,
  selectedRole,
  selectedPermissionCodes,
  isSystemRole = false,
  onTogglePermission,
  onToggleModuleAll,
}) => {
  if (!selectedRole) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/40 p-12 text-center">
        <Shield className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-50" />
        <p className="text-sm font-semibold text-foreground">Select a role to inspect permissions</p>
        <p className="text-xs text-muted-foreground mt-1">
          Pick a role from the left pane to view or modify its capability matrix.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => {
        const groupCodes = group.permissions.map((p) => p.code);
        const allGroupSelected = groupCodes.every((c) => selectedPermissionCodes.includes(c));

        return (
          <div
            key={group.module}
            className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm"
          >
            {/* Module header */}
            <div className="p-4 bg-muted/30 border-b border-border flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-foreground capitalize">
                  {group.module} Management
                </h4>
                <p className="text-xs text-muted-foreground">
                  Control operational access to {group.module.toLowerCase()} records and workflows.
                </p>
              </div>

              {!isSystemRole && (
                <button
                  type="button"
                  onClick={() => onToggleModuleAll(group)}
                  className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
                >
                  {allGroupSelected ? 'Deselect All' : 'Select All Module'}
                </button>
              )}
            </div>

            {/* Permissions Grid */}
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {group.permissions.map((perm) => {
                const isChecked = selectedPermissionCodes.includes(perm.code);

                return (
                  <div
                    key={perm.code}
                    onClick={() => {
                      if (!isSystemRole) onTogglePermission(perm.code);
                    }}
                    role="button"
                    tabIndex={0}
                    className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                      isChecked
                        ? 'border-primary/40 bg-primary/5'
                        : 'border-border/70 bg-background/50 hover:border-border'
                    } ${isSystemRole ? 'cursor-default opacity-85' : 'cursor-pointer'}`}
                  >
                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 border transition-colors ${
                        isChecked
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'border-input bg-background'
                      }`}
                    >
                      {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <span className="truncate">{perm.name}</span>
                        {perm.is_danger && (
                          <span className="text-[9px] uppercase font-bold text-destructive px-1.5 py-0.2 rounded bg-destructive/10">
                            High Risk
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                        {perm.description || perm.code}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
