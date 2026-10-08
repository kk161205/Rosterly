import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Wrench,
  Plus,
  LayoutGrid,
  List,
  Search,
  Filter,
  RefreshCw,
  AlertTriangle,
  Clock,
  Package,
  CheckCircle2,
} from 'lucide-react';
import { MaintenanceKanbanBoard } from '../components/maintenance/MaintenanceKanbanBoard';
import { MaintenanceTableView } from '../components/maintenance/MaintenanceTableView';
import { RaiseMaintenanceTicketModal } from '../components/maintenance/RaiseMaintenanceTicketModal';
import { TicketDetailDrawer } from '../components/maintenance/TicketDetailDrawer';
import { maintenanceService } from '../services/maintenanceService';
import type {
  MaintenanceTicketItem,
  MaintenanceTicketStatus,
  MaintenancePriority,
  CreateMaintenanceTicketPayload,
} from '../types/maintenance';

export const MaintenanceTicketsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialAssetId = searchParams.get('asset_id') || '';

  const [tickets, setTickets] = useState<MaintenanceTicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View switch: 'kanban' | 'table'
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  // Modals / Drawers
  const [isRaiseModalOpen, setIsRaiseModalOpen] = useState(!!initialAssetId);
  const [selectedTicket, setSelectedTicket] = useState<MaintenanceTicketItem | null>(null);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);

  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await maintenanceService.getTickets({
        status: statusFilter !== 'all' ? statusFilter : undefined,
        priority: priorityFilter !== 'all' ? priorityFilter : undefined,
        search: searchQuery.trim() || undefined,
      });
      setTickets(data);
    } catch (err: any) {
      console.error('Failed to load tickets', err);
      setError(err?.response?.data?.detail || err?.message || 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter, searchQuery]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const handleCreateTicket = async (payload: CreateMaintenanceTicketPayload) => {
    await maintenanceService.createTicket(payload);
    await fetchTickets();
  };

  const handleStatusChange = async (
    ticketId: string | number,
    newStatus: MaintenanceTicketStatus
  ) => {
    await maintenanceService.updateTicket(ticketId, { status: newStatus });
    await fetchTickets();
    if (selectedTicket && selectedTicket.id === ticketId) {
      const updated = await maintenanceService.getTicketById(ticketId);
      setSelectedTicket(updated);
    }
  };

  const handleResolveTicket = async (
    ticketId: string | number,
    notes: string,
    cost?: number
  ) => {
    await maintenanceService.resolveTicket(ticketId, notes, cost);
    await fetchTickets();
  };

  const handleSelectTicket = (t: MaintenanceTicketItem) => {
    setSelectedTicket(t);
    setIsDetailDrawerOpen(true);
  };

  // Metrics summary
  const openCount = tickets.filter((t) => t.status === 'open').length;
  const inProgressCount = tickets.filter((t) => t.status === 'in_progress').length;
  const waitingPartsCount = tickets.filter((t) => t.status === 'waiting_parts').length;
  const resolvedCount = tickets.filter((t) => t.status === 'resolved').length;

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Wrench className="w-7 h-7 text-primary" />
            Maintenance Tickets & Servicing
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track hardware diagnostic requests, repairs, parts logistics, and resolution SLAs.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex bg-muted p-1 rounded-xl border border-border">
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                viewMode === 'kanban'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              <span className="hidden sm:inline">Kanban</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                viewMode === 'table'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <List className="w-4 h-4" />
              <span className="hidden sm:inline">Table</span>
            </button>
          </div>

          <button
            onClick={() => fetchTickets()}
            className="p-2.5 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh tickets"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setIsRaiseModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm shadow-md hover:bg-primary/90 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Raise Ticket</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl border border-border bg-card shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-foreground">{openCount}</div>
            <div className="text-xs text-muted-foreground">Open Tickets</div>
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-border bg-card shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
            <Wrench className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-foreground">{inProgressCount}</div>
            <div className="text-xs text-muted-foreground">In Diagnostics</div>
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-border bg-card shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-foreground">{waitingPartsCount}</div>
            <div className="text-xs text-muted-foreground">Waiting Parts</div>
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-border bg-card shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-foreground">{resolvedCount}</div>
            <div className="text-xs text-muted-foreground">Resolved</div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search ticket, asset tag..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-input bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>

        <div className="flex items-center gap-3">
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary capitalize"
          >
            <option value="all">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary capitalize"
          >
            <option value="all">All Stages</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="waiting_parts">Waiting Parts</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Board or Table View */}
      {viewMode === 'kanban' ? (
        <MaintenanceKanbanBoard
          tickets={tickets}
          onSelectTicket={handleSelectTicket}
          onStatusChange={handleStatusChange}
        />
      ) : (
        <MaintenanceTableView
          tickets={tickets}
          loading={loading}
          onSelectTicket={handleSelectTicket}
        />
      )}

      {/* Raise Ticket Modal */}
      <RaiseMaintenanceTicketModal
        isOpen={isRaiseModalOpen}
        initialAssetId={initialAssetId}
        onClose={() => setIsRaiseModalOpen(false)}
        onSubmit={handleCreateTicket}
      />

      {/* Detail Drawer */}
      <TicketDetailDrawer
        isOpen={isDetailDrawerOpen}
        ticket={selectedTicket}
        onClose={() => {
          setIsDetailDrawerOpen(false);
          setSelectedTicket(null);
        }}
        onUpdateStatus={handleStatusChange}
        onResolveTicket={handleResolveTicket}
      />
    </div>
  );
};
export default MaintenanceTicketsPage;
