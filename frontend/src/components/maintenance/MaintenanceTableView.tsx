import React from 'react';
import {
  Clock,
  Wrench,
  Package,
  CheckCircle2,
  ChevronRight,
  User,
  Inbox,
} from 'lucide-react';
import type {
  MaintenanceTicketItem,
  MaintenanceTicketStatus,
  MaintenancePriority,
} from '../../types/maintenance';

interface MaintenanceTableViewProps {
  tickets: MaintenanceTicketItem[];
  loading: boolean;
  onSelectTicket: (ticket: MaintenanceTicketItem) => void;
}

export const MaintenanceTableView: React.FC<MaintenanceTableViewProps> = ({
  tickets,
  loading,
  onSelectTicket,
}) => {
  const getStatusBadge = (status: MaintenanceTicketStatus) => {
    switch (status) {
      case 'resolved':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" /> Resolved
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-500 border border-blue-500/20">
            <Wrench className="w-3.5 h-3.5" /> In Progress
          </span>
        );
      case 'waiting_parts':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-500 border border-purple-500/20">
            <Package className="w-3.5 h-3.5" /> Waiting Parts
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
            <Clock className="w-3.5 h-3.5" /> Open
          </span>
        );
    }
  };

  const getPriorityBadge = (priority: MaintenancePriority) => {
    switch (priority) {
      case 'urgent':
        return <span className="text-xs font-bold text-destructive">Urgent</span>;
      case 'high':
        return <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">High</span>;
      case 'medium':
        return <span className="text-xs font-medium text-foreground/80">Medium</span>;
      default:
        return <span className="text-xs text-muted-foreground">Low</span>;
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

  if (tickets.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
        <Inbox className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-60" />
        <h3 className="text-base font-semibold text-foreground">No Maintenance Tickets</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
          No tickets found matching the selected filter criteria.
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
              <th className="py-3.5 px-4">Asset Tag</th>
              <th className="py-3.5 px-4">Ticket Details</th>
              <th className="py-3.5 px-4">Priority</th>
              <th className="py-3.5 px-4">Status</th>
              <th className="py-3.5 px-4">Assigned Tech</th>
              <th className="py-3.5 px-4">Est. Cost</th>
              <th className="py-3.5 px-4">Created</th>
              <th className="py-3.5 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-sm">
            {tickets.map((t) => (
              <tr
                key={t.id}
                className="hover:bg-muted/40 transition-colors group cursor-pointer"
                onClick={() => onSelectTicket(t)}
              >
                <td className="py-4 px-4 font-mono font-bold text-xs text-primary">
                  {t.asset_tag}
                </td>
                <td className="py-4 px-4 max-w-xs">
                  <div className="font-semibold text-foreground group-hover:text-primary transition-colors">
                    {t.title}
                  </div>
                  <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                    {t.description}
                  </div>
                </td>
                <td className="py-4 px-4">{getPriorityBadge(t.priority)}</td>
                <td className="py-4 px-4">{getStatusBadge(t.status)}</td>
                <td className="py-4 px-4">
                  <div className="flex items-center gap-1.5 text-xs text-foreground font-medium">
                    <User className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>{t.assigned_to_name || 'Unassigned'}</span>
                  </div>
                </td>
                <td className="py-4 px-4 text-xs font-semibold text-foreground">
                  {t.estimated_cost ? `$${t.estimated_cost.toLocaleString()}` : '—'}
                </td>
                <td className="py-4 px-4 text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(t.created_at).toLocaleDateString()}
                </td>
                <td className="py-4 px-4 text-right">
                  <div className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80">
                    <span>Manage</span>
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
