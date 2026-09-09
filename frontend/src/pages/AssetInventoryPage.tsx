import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Plus,
  RefreshCw,
  Download,
  ShieldCheck,
  Building,
  AlertOctagon,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react'
import { AppLayout } from '@/components/layout/AppLayout'
import { AssetSummaryRibbon } from '@/components/assets/AssetSummaryRibbon'
import { AssetFilterBar } from '@/components/assets/AssetFilterBar'
import { AssetTable } from '@/components/assets/AssetTable'
import { AssetDetailDrawer } from '@/components/assets/AssetDetailDrawer'
import { AddAssetModal } from '@/components/assets/AddAssetModal'
import { AssetBulkActionBar } from '@/components/assets/AssetBulkActionBar'
import { DeleteAssetModal } from '@/components/assets/DeleteAssetModal'
import {
  AssetTableSkeleton,
  AssetEmptyState,
  AssetErrorState,
} from '@/components/assets/AssetSkeletons'
import { Button } from '@/components/common/CommonUI'
import { assetService } from '@/services/assetService'
import { authService } from '@/services/authService'
import {
  Asset,
  AssetStatus,
  AssetQueryFilters,
  AssetListResponse,
  AssetCreatePayload,
  AssetMetaResponse,
  AssetSummaryStats,
} from '@/types/assets'
import { Department } from '@/types/employee'
import { UserRole } from '@/types/dashboard'
import { UserProfile } from '@/types/auth'
import { authStorage } from '@/utils/authStorage'

const DEFAULT_FILTERS: AssetQueryFilters = {
  search: '',
  category: 'all',
  status: 'all',
  department_id: 'all',
  page: 1,
  page_size: 20,
}

export const AssetInventoryPage: React.FC = () => {
  const cachedUser = authStorage.getUser()
  const [currentRole, setCurrentRole] = useState<UserRole>((cachedUser?.role as UserRole) || 'employee')
  const [userProfile, setUserProfile] = useState<UserProfile | null>(cachedUser)

  const [filters, setFilters] = useState<AssetQueryFilters>(DEFAULT_FILTERS)
  const [departments, setDepartments] = useState<Department[]>([])
  const [assetMeta, setAssetMeta] = useState<AssetMetaResponse>({ categories: [], statuses: [] })
  const [summaryStats, setSummaryStats] = useState<AssetSummaryStats>({
    total: 0,
    deployed: 0,
    inStock: 0,
    underMaintenance: 0,
  })
  const [assetData, setAssetData] = useState<AssetListResponse>({
    items: [],
    total: 0,
    page: 1,
    page_size: 20,
    total_pages: 0,
  })

  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([])
  const [activeDrawerAsset, setActiveDrawerAsset] = useState<Asset | null>(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [assetToDelete, setAssetToDelete] = useState<Asset | null>(null)

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Show transient notification toast
  const triggerToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3000)
  }

  // Load live data from API
  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const [profileRes, deptRes, metaRes, summaryRes, assetRes] = await Promise.allSettled([
        authService.getCurrentUser(),
        assetService.getDepartments(),
        assetService.getAssetMeta(),
        assetService.getAssetSummary(),
        assetService.getAssets(filters),
      ])

      if (profileRes.status === 'fulfilled') {
        setUserProfile(profileRes.value)
        authStorage.setUser(profileRes.value)
        if (profileRes.value.role) {
          setCurrentRole(profileRes.value.role as UserRole)
        }
      }

      if (deptRes.status === 'fulfilled') {
        setDepartments(deptRes.value)
      }

      if (metaRes.status === 'fulfilled') {
        setAssetMeta(metaRes.value)
      }

      if (summaryRes.status === 'fulfilled') {
        setSummaryStats(summaryRes.value)
      }

      if (assetRes.status === 'fulfilled') {
        setAssetData(assetRes.value)
      } else {
        throw assetRes.reason
      }
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : 'Failed to load asset records from server'
      setError(String(msg || 'An error occurred while loading assets.'))
    } finally {
      setIsLoading(false)
    }
  }, [filters])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Filter handlers
  const handleFilterChange = (newFilters: Partial<AssetQueryFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }))
    setSelectedAssetIds([])
  }

  const handleResetFilters = () => {
    setFilters(DEFAULT_FILTERS)
    setSelectedAssetIds([])
  }

  // Selection handlers
  const handleToggleSelect = (assetId: string) => {
    setSelectedAssetIds((prev) =>
      prev.includes(assetId) ? prev.filter((id) => id !== assetId) : [...prev, assetId]
    )
  }

  const handleToggleSelectAll = () => {
    if (selectedAssetIds.length === assetData.items.length) {
      setSelectedAssetIds([])
    } else {
      setSelectedAssetIds(assetData.items.map((a) => a.id))
    }
  }

  // Bulk update handler
  const handleBulkUpdate = async (status: AssetStatus) => {
    if (selectedAssetIds.length === 0) return
    try {
      const res = await assetService.bulkUpdateAssets({
        asset_ids: selectedAssetIds,
        status,
      })
      triggerToast(`Successfully updated ${res.updated_count} assets to ${status.replace('_', ' ')}.`)
      setSelectedAssetIds([])
      await loadData()
    } catch {
      triggerToast('Bulk status update failed. Please try again.')
    }
  }

  // Quick single status update (e.g. from drawer)
  const handleQuickStatusChange = async (assetId: string, newStatus: AssetStatus) => {
    try {
      const updated = await assetService.updateAsset(assetId, { status: newStatus })
      triggerToast(`Asset ${updated.asset_tag} status updated to ${newStatus.replace('_', ' ')}.`)
      setActiveDrawerAsset(updated)
      await loadData()
    } catch {
      triggerToast('Status update failed.')
    }
  }

  // Add Asset handler
  const handleCreateAsset = async (payload: AssetCreatePayload) => {
    const created = await assetService.createAsset(payload)
    triggerToast(`Asset ${created.asset_tag} provisioned successfully!`)
    setIsAddModalOpen(false)
    await loadData()
  }

  // Delete Asset handler (super_admin)
  const handleDeleteAsset = async (assetId: string) => {
    await assetService.deleteAsset(assetId)
    triggerToast('Asset record permanently removed.')
    setAssetToDelete(null)
    if (activeDrawerAsset?.id === assetId) {
      setActiveDrawerAsset(null)
    }
    await loadData()
  }

  // Export CSV handler
  const handleExportCSV = () => {
    if (assetData.items.length === 0) return
    const headers = ['Asset Tag', 'Name', 'Category', 'Status', 'Vendor', 'Cost', 'Current Value', 'Warranty']
    const rows = assetData.items.map((a) => [
      a.asset_tag,
      `"${a.name.replace(/"/g, '""')}"`,
      a.category,
      a.status,
      `"${a.vendor.replace(/"/g, '""')}"`,
      a.purchase_cost,
      a.current_value,
      a.warranty_expiry || '',
    ])
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `rosterly-assets-export-${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    triggerToast(`Exported ${assetData.items.length} visible row(s) to CSV.`)
  }

  const canWrite = currentRole === 'super_admin' || currentRole === 'it_admin'
  const isEmployeeRole = currentRole === 'employee'

  return (
    <AppLayout
      currentRole={currentRole}
      userName={userProfile?.full_name}
      userEmail={userProfile?.email}
      isLoading={isLoading}
    >
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-20 right-8 z-50 bg-primary text-white text-xs font-medium px-4 py-2.5 rounded-lg shadow-xl border border-primary-container flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-150">
          <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Role Access Guidance Banners */}
      {isEmployeeRole && (
        <div className="p-4 rounded-lg bg-warning-container/40 border border-warning/40 flex items-start justify-between gap-3 text-xs">
          <div className="flex items-start gap-2.5 text-on-warning-container">
            <AlertOctagon className="w-4 h-4 flex-shrink-0 mt-0.5 text-warning" />
            <div>
              <p className="font-semibold">Restricted View: Assigned Assets Only</p>
              <p className="text-on-surface-variant text-[11px] mt-0.5">
                Full hardware inventory is managed by IT Administration. To view equipment currently assigned to you, visit your Employee Profile.
              </p>
            </div>
          </div>
          <Link to="/profile">
            <Button variant="outline" size="sm" icon={<ArrowRight className="w-3.5 h-3.5" />}>
              My Assigned Assets
            </Button>
          </Link>
        </div>
      )}

      {currentRole === 'manager' && (
        <div className="p-3 rounded-lg bg-accent-container/30 border border-accent/20 flex items-center gap-2.5 text-xs text-on-accent-container">
          <Building className="w-4 h-4 flex-shrink-0 text-accent" />
          <span>
            Department Scoped View: Displaying hardware and software assets currently held by employees in your department.
          </span>
        </div>
      )}

      {currentRole === 'auditor' && (
        <div className="p-3 rounded-lg bg-surface-container border border-outline-variant flex items-center gap-2.5 text-xs text-on-surface-variant">
          <ShieldCheck className="w-4 h-4 flex-shrink-0 text-tertiary" />
          <span>
            Audit Compliance Mode: System-wide read-only catalog inspection with verified financial depreciation tracking.
          </span>
        </div>
      )}

      {/* Header Action Ribbon */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-outline mb-1">
            <span>Asset Governance</span>
            <span>/</span>
            <span className="text-primary font-semibold">Inventory Catalog</span>
          </div>
          <h1 className="text-2xl font-sans font-bold text-primary tracking-tight">
            Asset Inventory
          </h1>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Track hardware lifecycle, warranty coverage, book values, and employee assignments
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <Button
            variant="outline"
            size="md"
            icon={<RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />}
            onClick={() => loadData()}
            title="Refresh asset catalog"
          >
            Refresh
          </Button>

          <Button
            variant="secondary"
            size="md"
            icon={<Download className="w-3.5 h-3.5" />}
            onClick={handleExportCSV}
            disabled={assetData.items.length === 0}
            title="Export the currently visible page of results as CSV"
          >
            Export Visible Rows
          </Button>

          {canWrite && (
            <Button
              variant="primary"
              size="md"
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => setIsAddModalOpen(true)}
            >
              Add Asset
            </Button>
          )}
        </div>
      </div>

      {/* Top Asset Summary Metric Ribbon */}
      <AssetSummaryRibbon
        totalCount={summaryStats.total}
        deployedCount={summaryStats.deployed}
        inStockCount={summaryStats.inStock}
        underMaintenanceCount={summaryStats.underMaintenance}
        isLoading={isLoading && assetData.items.length === 0}
      />

      {/* Filter and Search Bar */}
      <AssetFilterBar
        filters={filters}
        onFilterChange={handleFilterChange}
        onResetFilters={handleResetFilters}
        departments={departments}
        categories={assetMeta.categories}
        statuses={assetMeta.statuses}
        totalResults={assetData.total}
      />

      {/* Main Table or State Placeholders */}
      {error ? (
        <AssetErrorState message={error} onRetry={loadData} />
      ) : isLoading && assetData.items.length === 0 ? (
        <AssetTableSkeleton />
      ) : assetData.items.length === 0 ? (
        <AssetEmptyState
          hasFilters={Boolean(
            (filters.search && filters.search.length > 0) ||
              (filters.category && filters.category !== 'all') ||
              (filters.status && filters.status !== 'all') ||
              (filters.department_id && filters.department_id !== 'all')
          )}
          onReset={handleResetFilters}
          onAddAsset={() => setIsAddModalOpen(true)}
          canAdd={canWrite}
        />
      ) : (
        <AssetTable
          assets={assetData.items}
          selectedAssetIds={selectedAssetIds}
          onToggleSelect={handleToggleSelect}
          onToggleSelectAll={handleToggleSelectAll}
          onRowClick={(asset) => setActiveDrawerAsset(asset)}
          onDeleteClick={(asset) => setAssetToDelete(asset)}
          currentRole={currentRole}
          currentPage={assetData.page}
          pageSize={assetData.page_size}
          totalItems={assetData.total}
          totalPages={assetData.total_pages}
          onPageChange={(page) => handleFilterChange({ page })}
          onPageSizeChange={(pageSize) => handleFilterChange({ page_size: pageSize, page: 1 })}
        />
      )}

      {/* Bulk Action Toolbar */}
      {canWrite && (
        <AssetBulkActionBar
          selectedCount={selectedAssetIds.length}
          onBulkUpdate={handleBulkUpdate}
          onClearSelection={() => setSelectedAssetIds([])}
        />
      )}

      {/* Asset Inspection Detail Drawer */}
      <AssetDetailDrawer
        asset={activeDrawerAsset}
        isOpen={Boolean(activeDrawerAsset)}
        onClose={() => setActiveDrawerAsset(null)}
        onStatusChange={canWrite ? handleQuickStatusChange : undefined}
        currentRole={currentRole}
      />

      {/* Add Asset Modal */}
      {canWrite && (
        <AddAssetModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onSubmit={handleCreateAsset}
          existingCategories={assetMeta.categories}
        />
      )}

      {/* Delete Asset Modal (Super Admin only) */}
      <DeleteAssetModal
        asset={assetToDelete}
        isOpen={Boolean(assetToDelete)}
        onClose={() => setAssetToDelete(null)}
        onConfirm={handleDeleteAsset}
      />
    </AppLayout>
  )
}
