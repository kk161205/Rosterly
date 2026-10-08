import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Search,
  RefreshCw,
  Layers,
  Inbox,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { RequestCategoryCards } from '../components/requests/RequestCategoryCards';
import { MyRequestsTable } from '../components/requests/MyRequestsTable';
import { NewRequestModal } from '../components/requests/NewRequestModal';
import { ApprovalStepperDrawer } from '../components/requests/ApprovalStepperDrawer';
import { requestService } from '../services/requestService';
import type { RequestItem, RequestType, CreateRequestPayload } from '../types/requests';

export const UnifiedRequestsPage: React.FC = () => {
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modal / Drawer state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalInitialType, setModalInitialType] = useState<RequestType>('hardware');
  const [selectedRequest, setSelectedRequest] = useState<RequestItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params: any = {};
      if (typeFilter !== 'all') params.request_type = typeFilter;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const data = await requestService.getMyRequests(params);
      setRequests(data);
    } catch (err: any) {
      console.error('Failed to load requests', err);
      setError(err?.response?.data?.detail || err?.message || 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, [typeFilter, statusFilter, searchQuery]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleOpenCreateModal = (type: RequestType = 'hardware') => {
    setModalInitialType(type);
    setIsModalOpen(true);
  };

  const handleCreateRequest = async (payload: CreateRequestPayload) => {
    await requestService.createRequest(payload);
    await fetchRequests();
  };

  const handleSelectRequest = (req: RequestItem) => {
    setSelectedRequest(req);
    setIsDrawerOpen(true);
  };

  // Metrics
  const pendingCount = requests.filter((r) => r.status === 'pending' || r.status === 'in_review').length;
  const approvedCount = requests.filter((r) => r.status === 'approved' || r.status === 'fulfilled').length;

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Unified Request Portal
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Request hardware, software licenses, maintenance services, and track multi-tier approvals.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchRequests()}
            className="p-2.5 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh requests"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => handleOpenCreateModal('hardware')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm shadow-md hover:bg-primary/90 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>New Request</span>
          </button>
        </div>
      </div>

      {/* Category Cards Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
            Quick Request Catalogs
          </h2>
          <span className="text-xs text-muted-foreground">Select a category to pre-fill</span>
        </div>
        <RequestCategoryCards onSelectCategory={handleOpenCreateModal} />
      </div>

      {/* Overview Stat Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl border border-border bg-card shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">{requests.length}</div>
            <div className="text-xs text-muted-foreground">Total Requests Logged</div>
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-border bg-card shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">{pendingCount}</div>
            <div className="text-xs text-muted-foreground">Pending Review / Approvals</div>
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-border bg-card shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">{approvedCount}</div>
            <div className="text-xs text-muted-foreground">Approved & Fulfilled</div>
          </div>
        </div>
      </div>

      {/* Filter & History Table Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Inbox className="w-5 h-5 text-primary" />
            My Requests History
          </h2>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search ticket or title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-input bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>

            {/* Type filter */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="all">All Types</option>
              <option value="hardware">Hardware</option>
              <option value="software">Software</option>
              <option value="maintenance">Maintenance</option>
              <option value="transfer">Transfer</option>
              <option value="other">Other</option>
            </select>

            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="in_review">In Review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="fulfilled">Fulfilled</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <MyRequestsTable
          requests={requests}
          loading={loading}
          onSelectRequest={handleSelectRequest}
        />
      </div>

      {/* New Request Modal */}
      <NewRequestModal
        isOpen={isModalOpen}
        initialType={modalInitialType}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateRequest}
      />

      {/* Stepper Drawer */}
      <ApprovalStepperDrawer
        isOpen={isDrawerOpen}
        request={selectedRequest}
        onClose={() => {
          setIsDrawerOpen(false);
          setSelectedRequest(null);
        }}
      />
    </div>
  );
};
export default UnifiedRequestsPage;
