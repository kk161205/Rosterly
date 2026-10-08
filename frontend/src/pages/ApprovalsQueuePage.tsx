import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  Search,
  Layers,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { ApprovalsTable } from '../components/approvals/ApprovalsTable';
import { ApproveRejectModal } from '../components/approvals/ApproveRejectModal';
import { ApprovalStepperDrawer } from '../components/requests/ApprovalStepperDrawer';
import { approvalsService } from '../services/approvalsService';
import { requestService } from '../services/requestService';
import type { ApprovalQueueItem } from '../types/approvals';
import type { RequestItem } from '../types/requests';

export const ApprovalsQueuePage: React.FC = () => {
  const [items, setItems] = useState<ApprovalQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');

  // Multi selection
  const [selectedIds, setSelectedIds] = useState<Array<number | string>>([]);

  // Modal actions
  const [activeItem, setActiveItem] = useState<ApprovalQueueItem | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject'>('approve');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Detail drawer
  const [detailedRequest, setDetailedRequest] = useState<RequestItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const fetchQueue = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await approvalsService.getApprovalQueue();
      setItems(data);
    } catch (err: any) {
      console.error('Failed to load approval queue', err);
      setError(err?.response?.data?.detail || err?.message || 'Failed to load approval queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const handleToggleSelect = (id: number | string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredItems.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredItems.map((item) => item.id));
    }
  };

  const handleOpenActionModal = (item: ApprovalQueueItem, type: 'approve' | 'reject') => {
    setActiveItem(item);
    setActionType(type);
    setIsModalOpen(true);
  };

  const handleConfirmAction = async (id: number | string, comments?: string) => {
    if (actionType === 'approve') {
      await approvalsService.approveStep(id, comments);
    } else {
      await approvalsService.rejectStep(id, comments || '');
    }
    await fetchQueue();
    setSelectedIds((prev) => prev.filter((i) => i !== id));
  };

  const handleViewDetails = async (item: ApprovalQueueItem) => {
    try {
      const fullReq = await requestService.getRequestById(item.request_id);
      setDetailedRequest(fullReq);
      setIsDrawerOpen(true);
    } catch (err) {
      console.error('Failed to load request details', err);
    }
  };

  const handleBulkApprove = async () => {
    if (selectedIds.length === 0) return;
    try {
      setLoading(true);
      await approvalsService.bulkApprove(selectedIds, 'Bulk approved via manager queue');
      setSelectedIds([]);
      await fetchQueue();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to bulk approve');
      setLoading(false);
    }
  };

  const filteredItems = items.filter((item) => {
    if (departmentFilter !== 'all' && item.requester_department !== departmentFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchReq = item.requester_name.toLowerCase().includes(q);
      const matchTicket = (item.ticket_number || `REQ-${item.request_id}`).toLowerCase().includes(q);
      return matchTitle || matchReq || matchTicket;
    }
    return true;
  });

  const totalCost = filteredItems.reduce((acc, curr) => acc + (curr.estimated_cost || 0), 0);

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <ShieldCheck className="w-7 h-7 text-primary" />
            Approvals Queue
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review, authorize, or reject IT procurement and maintenance requests waiting on your role.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchQueue()}
            className="p-2.5 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh queue"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {selectedIds.length > 0 && (
            <button
              onClick={handleBulkApprove}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-md transition-all active:scale-95"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Approve Selected ({selectedIds.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl border border-border bg-card shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">{items.length}</div>
            <div className="text-xs text-muted-foreground">Pending Items in Your Queue</div>
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-border bg-card shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">
              ${totalCost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </div>
            <div className="text-xs text-muted-foreground">Total Budget Under Review</div>
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-border bg-card shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">{selectedIds.length}</div>
            <div className="text-xs text-muted-foreground">Items Selected For Bulk Action</div>
          </div>
        </div>
      </div>

      {/* Filter and Table */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-foreground">Awaiting Your Approval</h2>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search ticket, employee..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-input bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>

            {/* Department Filter */}
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="all">All Departments</option>
              <option value="Engineering">Engineering</option>
              <option value="Design">Design</option>
              <option value="Product">Product</option>
              <option value="Sales">Sales</option>
              <option value="Finance">Finance</option>
              <option value="HR & Operations">HR & Operations</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <ApprovalsTable
          items={filteredItems}
          loading={loading}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onSelectAll={handleSelectAll}
          onApprove={(item) => handleOpenActionModal(item, 'approve')}
          onReject={(item) => handleOpenActionModal(item, 'reject')}
          onViewDetails={handleViewDetails}
        />
      </div>

      {/* Modal for Approve/Reject single item */}
      <ApproveRejectModal
        isOpen={isModalOpen}
        item={activeItem}
        action={actionType}
        onClose={() => {
          setIsModalOpen(false);
          setActiveItem(null);
        }}
        onConfirm={handleConfirmAction}
      />

      {/* Stepper Drawer */}
      <ApprovalStepperDrawer
        isOpen={isDrawerOpen}
        request={detailedRequest}
        onClose={() => {
          setIsDrawerOpen(false);
          setDetailedRequest(null);
        }}
      />
    </div>
  );
};
export default ApprovalsQueuePage;
