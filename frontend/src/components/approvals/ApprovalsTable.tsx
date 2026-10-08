import React from 'react';
import {
  CheckCircle2,
  XCircle,
  ChevronRight,
  ShieldCheck,
  User,
} from 'lucide-react';
import type { ApprovalQueueItem } from '../../types/approvals';

interface ApprovalsTableProps {
  items: ApprovalQueueItem[];
  loading: boolean;
  selectedIds: Array<number | string>;
  onToggleSelect: (id: number | string) => void;
  onSelectAll: () => void;
  onApprove: (item: ApprovalQueueItem) => void;
  onReject: (item: ApprovalQueueItem) => void;
  onViewDetails: (item: ApprovalQueueItem) => void;
}

export const ApprovalsTable: React.FC<ApprovalsTableProps> = ({
  items,
  loading,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onApprove,
  onReject,
  onViewDetails,
}) => {
  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-muted/40 animate-pulse" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
        <ShieldCheck className="w-12 h-12 text-emerald-500 mx-auto mb-3 opacity-70" />
        <h3 className="text-base font-semibold text-foreground">No Pending Approvals</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
          Your approval queue is completely clear. Any incoming requests requiring your authorization will appear here.
        </p>
      </div>
    );
  }

  const allSelected = items.length > 0 && selectedIds.length === items.length;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="py-3.5 px-4 w-10 text-center">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onSelectAll}
                  className="rounded border-input text-primary focus:ring-primary/20"
                />
              </th>
              <th className="py-3.5 px-4">Ticket</th>
              <th className="py-3.5 px-4">Title & Request</th>
              <th className="py-3.5 px-4">Requester</th>
              <th className="py-3.5 px-4">Stage</th>
              <th className="py-3.5 px-4">Cost</th>
              <th className="py-3.5 px-4">Submitted</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-sm">
            {items.map((item) => {
              const isSelected = selectedIds.includes(item.id);
              return (
                <tr
                  key={item.id}
                  className={`hover:bg-muted/40 transition-colors ${
                    isSelected ? 'bg-primary/5' : ''
                  }`}
                >
                  <td className="py-4 px-4 text-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(item.id)}
                      className="rounded border-input text-primary focus:ring-primary/20"
                    />
                  </td>
                  <td className="py-4 px-4 font-mono font-medium text-xs text-primary">
                    {item.ticket_number || `REQ-${item.request_id}`}
                  </td>
                  <td className="py-4 px-4">
                    <div className="font-semibold text-foreground">{item.title}</div>
                    <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                      {item.justification}
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-muted-foreground" />
                      {item.requester_name}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{item.requester_department}</div>
                  </td>
                  <td className="py-4 px-4">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                      Step {item.step_order}: {item.approver_role}
                    </span>
                  </td>
                  <td className="py-4 px-4 font-semibold text-xs text-foreground">
                    {item.estimated_cost ? `$${item.estimated_cost.toLocaleString()}` : '—'}
                  </td>
                  <td className="py-4 px-4 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(item.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-4 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onApprove(item)}
                        className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 transition-colors"
                        title="Approve request"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onReject(item)}
                        className="p-1.5 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/30 transition-colors"
                        title="Reject request"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onViewDetails(item)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title="View details"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
