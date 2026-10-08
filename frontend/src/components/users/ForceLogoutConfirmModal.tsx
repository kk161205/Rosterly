import React, { useState } from 'react';
import { X, LogOut, AlertTriangle, ShieldAlert } from 'lucide-react';
import type { UserAccountItem } from '../../types/users';

interface ForceLogoutConfirmModalProps {
  isOpen: boolean;
  user: UserAccountItem | null;
  onClose: () => void;
  onConfirm: (userId: string | number) => Promise<void>;
}

export const ForceLogoutConfirmModal: React.FC<ForceLogoutConfirmModalProps> = ({
  isOpen,
  user,
  onClose,
  onConfirm,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !user) return null;

  const handleConfirm = async () => {
    try {
      setLoading(true);
      setError(null);
      await onConfirm(user.id);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to force logout session');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-border flex items-start justify-between bg-destructive/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-destructive/20 text-destructive flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Revoke Active Sessions</h2>
              <p className="text-xs text-muted-foreground">{user.name} ({user.email})</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs text-muted-foreground leading-relaxed">
          {error && (
            <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <p>
            This action will immediately invalidate all refresh tokens, active OAuth sessions, and API tokens associated with <strong>{user.name}</strong>.
          </p>

          <p className="p-3 rounded-xl bg-muted border border-border text-foreground font-medium">
            The user will be required to re-authenticate with their credentials and secondary MFA factor on their next request.
          </p>
        </div>

        <div className="p-4 border-t border-border bg-muted/10 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium rounded-xl border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-all shadow-md active:scale-95 disabled:opacity-50"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-destructive-foreground border-t-transparent rounded-full animate-spin" />
            ) : (
              <LogOut className="w-4 h-4" />
            )}
            {loading ? 'Revoking...' : 'Force Logout'}
          </button>
        </div>
      </div>
    </div>
  );
};
