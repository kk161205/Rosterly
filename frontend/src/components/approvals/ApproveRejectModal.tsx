import React, { useState } from 'react';
import { X, CheckCircle2, XCircle, AlertTriangle, MessageSquare } from 'lucide-react';
import type { ApprovalQueueItem } from '../../types/approvals';

interface ApproveRejectModalProps {
  isOpen: boolean;
  item: ApprovalQueueItem | null;
  action: 'approve' | 'reject';
  onClose: () => void;
  onConfirm: (id: number | string, comments?: string) => Promise<void>;
}

export const ApproveRejectModal: React.FC<ApproveRejectModalProps> = ({
  isOpen,
  item,
  action,
  onClose,
  onConfirm,
}) => {
  const [comments, setComments] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !item) return null;

  const isApprove = action === 'approve';

  const handleConfirm = async () => {
    if (!isApprove && !comments.trim()) {
      setError('Please provide a reason / comment for rejecting this request.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await onConfirm(item.id, comments.trim() || undefined);
      setComments('');
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || `Failed to ${action} request`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 border-b border-border flex items-start justify-between bg-muted/20">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isApprove
                  ? 'bg-emerald-500/10 text-emerald-500'
                  : 'bg-destructive/10 text-destructive'
              }`}
            >
              {isApprove ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">
                {isApprove ? 'Approve Request' : 'Reject Request'}
              </h2>
              <p className="text-xs text-muted-foreground">
                {item.ticket_number || `REQ-${item.request_id}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Context summary */}
          <div className="p-4 rounded-xl bg-muted/30 border border-border/60 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Title:</span>
              <span className="font-semibold text-foreground">{item.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Requester:</span>
              <span className="font-medium text-foreground">{item.requester_name} ({item.requester_department})</span>
            </div>
            {item.estimated_cost && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Est. Cost:</span>
                <span className="font-bold text-foreground">${item.estimated_cost.toLocaleString()}</span>
              </div>
            )}
            <div className="pt-2 border-t border-border/40 text-muted-foreground italic">
              "{item.justification}"
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-primary" />
              Decision Comments {isApprove ? '(Optional)' : <span className="text-destructive">*</span>}
            </label>
            <textarea
              rows={3}
              placeholder={
                isApprove
                  ? 'Add any conditions, fulfillment instructions, or notes for the audit trail...'
                  : 'Specify why this request cannot be approved (budget constraints, policy violation, etc.)...'
              }
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
            />
          </div>
        </div>

        {/* Footer */}
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
            className={`inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-xl text-white shadow-md transition-all active:scale-95 disabled:opacity-50 ${
              isApprove
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-destructive hover:bg-destructive/90'
            }`}
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : isApprove ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <XCircle className="w-4 h-4" />
            )}
            {loading ? 'Processing...' : isApprove ? 'Confirm Approval' : 'Confirm Rejection'}
          </button>
        </div>
      </div>
    </div>
  );
};
