import React from 'react';
import {
  Clock,
  Wrench,
  Package,
  CheckCircle2,
  User,
  DollarSign,
} from 'lucide-react';
import type {
  MaintenanceTicketItem,
  MaintenanceTicketStatus,
  MaintenancePriority,
} from '../../types/maintenance';

interface KanbanColumnConfig {
  id: MaintenanceTicketStatus;
  title: string;
  icon: React.ReactNode;
  badgeClass: string;
}

const COLUMNS: KanbanColumnConfig[] = [
  {
    id: 'open',
    title: 'Open / Queued',
    icon: <Clock className="w-4 h-4 text-amber-500" />,
    badgeClass: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  },
  {
    id: 'in_progress',
    title: 'In Progress (Diagnostics)',
    icon: <Wrench className="w-4 h-4 text-blue-500" />,
    badgeClass: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  },
  {
    id: 'waiting_parts',
    title: 'Waiting on Parts',
    icon: <Package className="w-4 h-4 text-purple-500" />,
    badgeClass: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  },
  {
    id: 'resolved',
    title: 'Resolved / Closed',
    icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
    badgeClass: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  },
];

interface MaintenanceKanbanBoardProps {
  tickets: MaintenanceTicketItem[];
  onSelectTicket: (ticket: MaintenanceTicketItem) => void;
  onStatusChange: (ticketId: string | number, newStatus: MaintenanceTicketStatus) => Promise<void>;
}

export const MaintenanceKanbanBoard: React.FC<MaintenanceKanbanBoardProps> = ({
  tickets,
  onSelectTicket,
  onStatusChange,
}) => {
  const getPriorityBadge = (priority: MaintenancePriority) => {
    switch (priority) {
      case 'urgent':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-destructive/10 text-destructive border border-destructive/20 uppercase tracking-wider">
            Urgent
          </span>
        );
      case 'high':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            High
          </span>
        );
      case 'medium':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-foreground/80 border border-border">
            Medium
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground border border-border">
            Low
          </span>
        );
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {COLUMNS.map((col) => {
        const columnTickets = tickets.filter((t) => t.status === col.id);

        return (
          <div
            key={col.id}
            className="flex flex-col rounded-2xl bg-card border border-border overflow-hidden shadow-sm min-h-[500px]"
          >
            {/* Column Header */}
            <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {col.icon}
                <h3 className="text-xs font-bold text-foreground">{col.title}</h3>
              </div>
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${col.badgeClass}`}
              >
                {columnTickets.length}
              </span>
            </div>

            {/* Tickets Drop / Card List */}
            <div className="flex-1 p-3 space-y-3 overflow-y-auto max-h-[calc(100vh-280px)]">
              {columnTickets.length === 0 ? (
                <div className="h-32 flex flex-col items-center justify-center text-center p-4 border border-dashed border-border/70 rounded-xl text-muted-foreground">
                  <p className="text-xs">No tickets in this stage</p>
                </div>
              ) : (
                columnTickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    onClick={() => onSelectTicket(ticket)}
                    className="p-4 rounded-xl bg-background border border-border/70 hover:border-primary/50 dark:hover:border-primary/50 shadow-sm hover:shadow-md transition-all cursor-pointer space-y-3 group"
                  >
                    {/* Header: Asset Tag & Priority */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-primary group-hover:underline">
                        {ticket.asset_tag}
                      </span>
                      {getPriorityBadge(ticket.priority)}
                    </div>

                    {/* Ticket Title */}
                    <div>
                      <h4 className="text-xs font-bold text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                        {ticket.title}
                      </h4>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                        {ticket.description}
                      </p>
                    </div>

                    {/* Metadata: Assigned Tech & Cost */}
                    <div className="pt-2.5 border-t border-border/50 flex items-center justify-between text-[11px] text-muted-foreground">
                      <div className="flex items-center gap-1.5 truncate max-w-[140px]">
                        <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate">{ticket.assigned_to_name || 'Unassigned'}</span>
                      </div>

                      {ticket.estimated_cost && (
                        <div className="flex items-center gap-0.5 font-semibold text-foreground">
                          <DollarSign className="w-3 h-3 text-muted-foreground" />
                          <span>{ticket.estimated_cost.toLocaleString()}</span>
                        </div>
                      )}
                    </div>

                    {/* Quick Move Trigger Buttons */}
                    <div
                      className="pt-2 border-t border-border/40 flex items-center justify-between gap-1 text-[10px]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="text-muted-foreground">Move to:</span>
                      <div className="flex gap-1">
                        {col.id !== 'open' && (
                          <button
                            type="button"
                            onClick={() => onStatusChange(ticket.id, 'open')}
                            className="px-1.5 py-0.5 rounded bg-muted hover:bg-muted-foreground/20 text-foreground transition-colors"
                          >
                            Open
                          </button>
                        )}
                        {col.id !== 'in_progress' && (
                          <button
                            type="button"
                            onClick={() => onStatusChange(ticket.id, 'in_progress')}
                            className="px-1.5 py-0.5 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 transition-colors"
                          >
                            Diag
                          </button>
                        )}
                        {col.id !== 'waiting_parts' && (
                          <button
                            type="button"
                            onClick={() => onStatusChange(ticket.id, 'waiting_parts')}
                            className="px-1.5 py-0.5 rounded bg-purple-500/10 hover:bg-purple-500/20 text-purple-500 transition-colors"
                          >
                            Parts
                          </button>
                        )}
                        {col.id !== 'resolved' && (
                          <button
                            type="button"
                            onClick={() => onStatusChange(ticket.id, 'resolved')}
                            className="px-1.5 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 transition-colors"
                          >
                            Done
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
