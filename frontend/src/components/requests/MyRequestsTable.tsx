import React from 'react';
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronRight,
  Inbox,
} from 'lucide-react';
import type { RequestItem, RequestStatus, RequestPriority } from '../../types/requests';

interface MyRequestsTableProps {
  requests: RequestItem[];
  loading: boolean;
  onSelectRequest: (request: RequestItem) => void;
  onCancelRequest?: (id: number | string) => void;
}

export const MyRequestsTable: React.FC<MyRequestsTableProps> = ({
  requests,
  loading,
  onSelectRequest,
  onCancelRequest,
}) => {
  const getStatusBadge = (status: RequestStatus) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" /> Approved
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-destructive/10 text-destructive border border-destructive/20">
            <XCircle className="w-3.5 h-3.5" /> Rejected
          </span>
        );
      case 'in_review':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-500 border border-blue-500/20">
            <Clock className="w-3.5 h-3.5" /> In Review
          </span>
        );
      case 'fulfilled':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
            <CheckCircle2 className="w-3.5 h-3.5" /> Fulfilled
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border">
            Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <Clock className="w-3.5 h-3.5" /> Pending
          </span>
        );
    }
  };

  const getPriorityBadge = (priority: RequestPriority) => {
    switch (priority) {
      case 'urgent':
        return <span className="text-[11px] font-bold text-destructive">Urgent</span>;
      case 'high':
        return <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">High</span>;
      case 'medium':
        return <span className="text-[11px] font-medium text-foreground/80">Medium</span>;
      default:
        return <span className="text-[11px] text-muted-foreground">Low</span>;
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

  if (requests.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
        <Inbox className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-60" />
        <h3 className="text-base font-semibold text-foreground">No requests found</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
          You haven't submitted any hardware, software, or IT service requests matching the filter.
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
              <th className="py-3.5 px-4">Ticket</th>
              <th className="py-3.5 px-4">Title & Details</th>
              <th className="py-3.5 px-4">Category</th>
              <th className="py-3.5 px-4">Priority</th>
              <th className="py-3.5 px-4">Status</th>
              <th className="py-3.5 px-4">Submitted</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-sm">
            {requests.map((req) => (
              <tr
                key={req.id}
                className="hover:bg-muted/40 transition-colors group cursor-pointer"
                onClick={() => onSelectRequest(req)}
              >
                <td className="py-4 px-4 font-mono font-medium text-xs text-primary">
                  {req.ticket_number || `REQ-${req.id}`}
                </td>
                <td className="py-4 px-4">
                  <div className="font-semibold text-foreground group-hover:text-primary transition-colors">
                    {req.title}
                  </div>
                  <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                    {req.justification}
                  </div>
                </td>
                <td className="py-4 px-4">
                  <span className="capitalize text-xs font-medium px-2 py-0.5 rounded bg-muted text-foreground">
                    {req.request_type}
                  </span>
                </td>
                <td className="py-4 px-4">{getPriorityBadge(req.priority)}</td>
                <td className="py-4 px-4">{getStatusBadge(req.status)}</td>
                <td className="py-4 px-4 text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(req.created_at).toLocaleDateString()}
                </td>
                <td className="py-4 px-4 text-right">
                  <div
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectRequest(req);
                    }}
                  >
                    <span>View Stages</span>
                    <ChevronRight className="w-4 h-4" />
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
