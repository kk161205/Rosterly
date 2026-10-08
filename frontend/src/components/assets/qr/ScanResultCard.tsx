import React, { useState } from 'react';
import {
  Laptop,
  UserCheck,
  UserMinus,
  Wrench,
  CheckCircle2,
  Calendar,
  Building2,
  Layers,
  ShieldAlert,
  ArrowRightLeft,
  RotateCcw,
} from 'lucide-react';
import type { AssetDetailResponse } from '../../../types/assets';

interface ScanResultCardProps {
  assetData: AssetDetailResponse;
  onCheckOut: (employeeId: string, notes?: string) => Promise<void>;
  onCheckIn: (condition: string, notes?: string) => Promise<void>;
  onRaiseTicket: () => void;
  onResetScan: () => void;
}

export const ScanResultCard: React.FC<ScanResultCardProps> = ({
  assetData,
  onCheckOut,
  onCheckIn,
  onRaiseTicket,
  onResetScan,
}) => {
  const { asset, active_assignment } = assetData;
  const isAssigned = !!active_assignment;

  const [actionLoading, setActionLoading] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [returnCondition, setReturnCondition] = useState('good');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleExecuteCheckOut = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId.trim()) {
      setError('Please enter or select an Employee ID.');
      return;
    }
    try {
      setActionLoading(true);
      setError(null);
      await onCheckOut(employeeId.trim(), notes.trim() || undefined);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Check-out failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExecuteCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setActionLoading(true);
      setError(null);
      await onCheckIn(returnCondition, notes.trim() || undefined);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Check-in failed');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = () => {
    switch (asset.status) {
      case 'in_stock':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            In Stock (Available)
          </span>
        );
      case 'deployed':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-500 border border-blue-500/20">
            Deployed (Assigned)
          </span>
        );
      case 'under_maintenance':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
            Under Maintenance
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border">
            {asset.status}
          </span>
        );
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto bg-card border border-border rounded-2xl p-6 shadow-xl space-y-6 animate-in fade-in zoom-in-95 duration-200">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-border pb-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Laptop className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-primary">{asset.asset_tag}</span>
              {getStatusBadge()}
            </div>
            <h2 className="text-xl font-bold text-foreground mt-1">
              {asset.manufacturer} {asset.model}
            </h2>
            <p className="text-xs text-muted-foreground capitalize">
              Category: {asset.category} • Serial: {asset.serial_number || 'N/A'}
            </p>
          </div>
        </div>

        <button
          onClick={onResetScan}
          className="p-2 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Scan another asset"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Current Custody / Assignment Overview */}
      <div className="p-4 rounded-xl bg-muted/40 border border-border/60 space-y-2">
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
          Custody State
        </h3>
        {isAssigned ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-foreground">
                {active_assignment?.employee?.name || 'Assigned Employee'}
              </p>
              <p className="text-xs text-muted-foreground">
                {active_assignment?.employee?.email || ''} • Dept:{' '}
                {active_assignment?.employee?.department || 'General'}
              </p>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                <span>Since {new Date(active_assignment?.assigned_at || '').toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            <CheckCircle2 className="w-4 h-4" />
            <span>Asset is currently idle in inventory and ready for check-out.</span>
          </div>
        )}
      </div>

      {/* Action Forms */}
      {isAssigned ? (
        /* Return / Check-In Form */
        <form onSubmit={handleExecuteCheckIn} className="space-y-4 pt-2 border-t border-border">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <UserMinus className="w-4 h-4 text-primary" />
            Check-In / Return Asset to Stock
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Physical Condition on Return
              </label>
              <select
                value={returnCondition}
                onChange={(e) => setReturnCondition(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="good">Good (Ready for Reassignment)</option>
                <option value="fair">Fair (Minor Scratches / Wear)</option>
                <option value="damaged">Damaged (Requires Repair)</option>
                <option value="lost">Lost / Missing Components</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Return Notes (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Returned power adapter, clean device"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={actionLoading}
              className="flex-1 py-2.5 px-4 bg-primary text-primary-foreground text-xs font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-all shadow-md active:scale-98 flex items-center justify-center gap-2"
            >
              <ArrowRightLeft className="w-4 h-4" />
              <span>{actionLoading ? 'Processing Return...' : 'Confirm Check-In'}</span>
            </button>
            <button
              type="button"
              onClick={onRaiseTicket}
              className="px-4 py-2.5 rounded-xl border border-border hover:bg-muted text-foreground text-xs font-semibold flex items-center gap-2 transition-colors"
            >
              <Wrench className="w-4 h-4" />
              <span>Maintenance Ticket</span>
            </button>
          </div>
        </form>
      ) : (
        /* Assign / Check-Out Form */
        <form onSubmit={handleExecuteCheckOut} className="space-y-4 pt-2 border-t border-border">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-primary" />
            Check-Out / Issue Asset to Employee
          </h3>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Assignee Employee ID / Code <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. EMP-1049 or employee UUID"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Issuance Notes (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Issued for Q4 Engineering Project"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={actionLoading}
              className="flex-1 py-2.5 px-4 bg-primary text-primary-foreground text-xs font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-all shadow-md active:scale-98 flex items-center justify-center gap-2"
            >
              <UserCheck className="w-4 h-4" />
              <span>{actionLoading ? 'Issuing Asset...' : 'Confirm Check-Out'}</span>
            </button>
            <button
              type="button"
              onClick={onRaiseTicket}
              className="px-4 py-2.5 rounded-xl border border-border hover:bg-muted text-foreground text-xs font-semibold flex items-center gap-2 transition-colors"
            >
              <Wrench className="w-4 h-4" />
              <span>Maintenance Ticket</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
