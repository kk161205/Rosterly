import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  FileText,
} from 'lucide-react';
import type {
  MaintenanceTicketItem,
  MaintenanceTicketStatus,
} from '../../types/maintenance';

interface TicketDetailDrawerProps {
  ticket: MaintenanceTicketItem | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateStatus: (id: string | number, status: MaintenanceTicketStatus) => Promise<void>;
  onResolveTicket: (id: string | number, notes: string, cost?: number) => Promise<void>;
}

export const TicketDetailDrawer: React.FC<TicketDetailDrawerProps> = ({
  ticket,
  isOpen,
  onClose,
  onUpdateStatus,
  onResolveTicket,
}) => {
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [actualCost, setActualCost] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !ticket) return null;

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolutionNotes.trim()) {
      setError('Please provide resolution notes before closing.');
      return;
    }
    try {
      setActionLoading(true);
      setError(null);
      await onResolveTicket(
        ticket.id,
        resolutionNotes.trim(),
        actualCost ? parseFloat(actualCost) : undefined
      );
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to resolve ticket');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStatusSelect = async (status: MaintenanceTicketStatus) => {
    try {
      setActionLoading(true);
      setError(null);
      await onUpdateStatus(ticket.id, status);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to update status');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="relative w-full max-w-lg bg-card border-l border-border shadow-2xl flex flex-col h-full z-10 animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-6 border-b border-border flex items-start justify-between bg-muted/20">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-primary px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
                {ticket.asset_tag}
              </span>
              <span className="text-xs capitalize px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground font-medium">
                {ticket.status.replace('_', ' ')}
              </span>
            </div>
            <h2 className="text-lg font-bold text-foreground mt-2">{ticket.title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Created on {new Date(ticket.created_at).toLocaleDateString()} by{' '}
              {ticket.created_by_name || 'System'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Issue Description */}
          <div className="p-4 rounded-xl bg-muted/40 border border-border/60 space-y-2">
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Problem Description
            </h3>
            <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
              {ticket.description}
            </p>
          </div>

          {/* Ticket Metadata Details */}
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="p-3 rounded-xl border border-border/60 bg-card space-y-1">
              <span className="text-muted-foreground">Priority Level</span>
              <div className="font-bold capitalize text-foreground">{ticket.priority}</div>
            </div>
            <div className="p-3 rounded-xl border border-border/60 bg-card space-y-1">
              <span className="text-muted-foreground">Assigned Technician</span>
              <div className="font-bold text-foreground">
                {ticket.assigned_to_name || 'Unassigned'}
              </div>
            </div>
            <div className="p-3 rounded-xl border border-border/60 bg-card space-y-1">
              <span className="text-muted-foreground">Estimated Cost</span>
              <div className="font-bold text-foreground">
                {ticket.estimated_cost ? `$${ticket.estimated_cost.toLocaleString()}` : '—'}
              </div>
            </div>
            <div className="p-3 rounded-xl border border-border/60 bg-card space-y-1">
              <span className="text-muted-foreground">Actual Billed Cost</span>
              <div className="font-bold text-foreground">
                {ticket.actual_cost ? `$${ticket.actual_cost.toLocaleString()}` : '—'}
              </div>
            </div>
          </div>

          {/* Quick Stage Transition */}
          <div className="space-y-2 pt-2 border-t border-border">
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Change Ticket Status
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['open', 'in_progress', 'waiting_parts', 'resolved'] as MaintenanceTicketStatus[]).map(
                (st) => (
                  <button
                    key={st}
                    disabled={actionLoading || ticket.status === st}
                    onClick={() => handleStatusSelect(st)}
                    className={`py-2 px-2.5 rounded-xl text-xs font-semibold border transition-all capitalize ${
                      ticket.status === st
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border bg-card text-foreground hover:bg-muted'
                    }`}
                  >
                    {st.replace('_', ' ')}
                  </button>
                )
              )}
            </div>
          </div>

          {/* Resolution Section if not yet resolved */}
          {ticket.status !== 'resolved' ? (
            <form onSubmit={handleResolve} className="space-y-3 pt-2 border-t border-border">
              <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                Close / Resolve Ticket
              </h3>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Resolution Notes <span className="text-destructive">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Summarize actions taken, replaced components, vendor invoice details..."
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-input bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Final Actual Cost ($ USD)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 145.50"
                  value={actualCost}
                  onChange={(e) => setActualCost(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <button
                type="submit"
                disabled={actionLoading}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{actionLoading ? 'Saving...' : 'Resolve and Close Ticket'}</span>
              </button>
            </form>
          ) : (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs space-y-1.5">
              <div className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Ticket Resolved
              </div>
              <p className="text-foreground/90 italic">"{ticket.resolution_notes || 'Resolved'}"</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
