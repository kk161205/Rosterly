import React, { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, RefreshCw, Cpu, History, Wrench, CheckCircle2 } from 'lucide-react'
import { AppLayout } from '@/components/layout/AppLayout'
import { AssetHeroBanner } from '@/components/assets/detail/AssetHeroBanner'
import { LiveDepreciationCard } from '@/components/assets/detail/LiveDepreciationCard'
import { SpecificationsTab } from '@/components/assets/detail/SpecificationsTab'
import { AssignmentHistoryTab } from '@/components/assets/detail/AssignmentHistoryTab'
import { MaintenanceHistoryTab } from '@/components/assets/detail/MaintenanceHistoryTab'
import { AssignAssetModal } from '@/components/assets/detail/AssignAssetModal'
import { ReturnAssetModal } from '@/components/assets/detail/ReturnAssetModal'
import { EditAssetModal } from '@/components/assets/detail/EditAssetModal'
import { RaiseTicketModal } from '@/components/assets/detail/RaiseTicketModal'
import {
  AssetDetailSkeleton,
  AssetNotFoundState,
  AssetDetailErrorState,
} from '@/components/assets/detail/AssetDetailSkeleton'
import { Button } from '@/components/common/CommonUI'
import { assetService } from '@/services/assetService'
import { authService } from '@/services/authService'
import {
  Asset,
  AssetAssignment,
  MaintenanceTicket,
  AssetAssignPayload,
  AssetReturnPayload,
  AssetUpdatePayload,
  TicketPriority,
} from '@/types/assets'
import { UserRole } from '@/types/dashboard'
import { UserProfile } from '@/types/auth'
import { authStorage } from '@/utils/authStorage'

type TabType = 'specs' | 'history' | 'maintenance'

export const AssetDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()

  const cachedUser = authStorage.getUser()
  const [currentRole, setCurrentRole] = useState<UserRole>((cachedUser?.role as UserRole) || 'employee')
  const [userProfile, setUserProfile] = useState<UserProfile | null>(cachedUser)

  const [asset, setAsset] = useState<Asset | null>(null)
  const [currentAssignment, setCurrentAssignment] = useState<AssetAssignment | null>(null)
  const [assignments, setAssignments] = useState<AssetAssignment[]>([])
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([])

  const [activeTab, setActiveTab] = useState<TabType>('specs')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isNotFound, setIsNotFound] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Modals state
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false)
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isRaiseTicketModalOpen, setIsRaiseTicketModalOpen] = useState(false)

  const triggerToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3000)
  }

  const loadData = useCallback(async () => {
    if (!id) return
    setIsLoading(true)
    setError(null)
    setIsNotFound(false)

    try {
      const [profileRes, detailRes, assignmentsRes, maintenanceRes] = await Promise.allSettled([
        authService.getCurrentUser(),
        assetService.getAssetDetail(id),
        assetService.getAssetAssignments(id),
        assetService.getAssetMaintenance(id),
      ])

      if (profileRes.status === 'fulfilled') {
        setUserProfile(profileRes.value)
        authStorage.setUser(profileRes.value)
        if (profileRes.value.role) {
          setCurrentRole(profileRes.value.role as UserRole)
        }
      }

      if (detailRes.status === 'fulfilled') {
        setAsset(detailRes.value.asset)
        setCurrentAssignment(detailRes.value.current_assignment || null)
      } else {
        const status = (detailRes.reason as { response?: { status?: number } })?.response?.status
        if (status === 404) {
          setIsNotFound(true)
          return
        }
        throw detailRes.reason
      }

      if (assignmentsRes.status === 'fulfilled') {
        setAssignments(assignmentsRes.value)
      }

      if (maintenanceRes.status === 'fulfilled') {
        setTickets(maintenanceRes.value)
      }
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : 'Failed to load asset details'
      setError(String(msg || 'An error occurred.'))
    } finally {
      setIsLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Handlers for asset actions
  const handleAssign = async (payload: AssetAssignPayload) => {
    if (!id) return
    await assetService.assignAsset(id, payload)
    triggerToast('Asset successfully assigned!')
    setIsAssignModalOpen(false)
    await loadData()
  }

  const handleReturn = async (payload: AssetReturnPayload) => {
    if (!id) return
    await assetService.returnAsset(id, payload)
    triggerToast('Asset returned to stock successfully!')
    setIsReturnModalOpen(false)
    await loadData()
  }

  const handleUpdate = async (payload: AssetUpdatePayload) => {
    if (!id) return
    await assetService.updateAsset(id, payload)
    triggerToast('Asset record updated successfully!')
    setIsEditModalOpen(false)
    await loadData()
  }

  const handleRaiseTicket = async (payload: { issue_description: string; priority: TicketPriority }) => {
    if (!id) return
    await assetService.createMaintenanceTicket({ asset_id: id, ...payload })
    triggerToast('Service ticket submitted successfully!')
    setIsRaiseTicketModalOpen(false)
    await loadData()
  }

  const tabs: { key: TabType; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: 'specs', label: 'Specifications', icon: <Cpu className="w-4 h-4" /> },
    {
      key: 'history',
      label: 'Assignment History',
      icon: <History className="w-4 h-4" />,
      count: assignments.length,
    },
    {
      key: 'maintenance',
      label: 'Maintenance History',
      icon: <Wrench className="w-4 h-4" />,
      count: tickets.length,
    },
  ]

  return (
    <AppLayout
      currentRole={currentRole}
      userName={userProfile?.full_name}
      userEmail={userProfile?.email}
      isLoading={isLoading}
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-8 z-50 bg-primary text-white text-xs font-medium px-4 py-2.5 rounded-lg shadow-xl border border-primary-container flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-150">
          <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Breadcrumb Navigation & Top Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs font-mono text-outline">
          <Link
            to="/assets"
            className="flex items-center gap-1.5 hover:text-primary transition-colors text-on-surface-variant font-medium"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Asset Inventory</span>
          </Link>
          <span>/</span>
          <span className="text-primary font-bold">
            {asset ? asset.asset_tag : 'Loading Asset...'}
          </span>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />}
            onClick={() => loadData()}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Content Rendering */}
      {isNotFound ? (
        <AssetNotFoundState />
      ) : error ? (
        <AssetDetailErrorState message={error} onRetry={loadData} />
      ) : isLoading && !asset ? (
        <AssetDetailSkeleton />
      ) : asset ? (
        <div className="space-y-6">
          {/* Top Hero Banner */}
          <AssetHeroBanner
            asset={asset}
            currentRole={currentRole}
            onAssignClick={() => setIsAssignModalOpen(true)}
            onReturnClick={() => setIsReturnModalOpen(true)}
            onEditClick={() => setIsEditModalOpen(true)}
          />

          {/* Live Depreciation & Valuation Metric Card */}
          <LiveDepreciationCard asset={asset} />

          {/* Tab Navigation Controls */}
          <div className="border-b border-outline-variant/60 flex items-center gap-2 select-none overflow-x-auto">
            {tabs.map((tab) => {
              const isSelected = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-3 text-xs font-sans font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                    isSelected
                      ? 'border-accent text-accent'
                      : 'border-transparent text-on-surface-variant hover:text-primary hover:border-outline-variant'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  {typeof tab.count === 'number' && (
                    <span
                      className={`px-1.5 py-0.2 rounded-full font-mono text-[10px] ${
                        isSelected
                          ? 'bg-accent/10 text-accent font-bold'
                          : 'bg-surface-container text-outline'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Active Tab Panel */}
          <div>
            {activeTab === 'specs' && <SpecificationsTab asset={asset} />}
            {activeTab === 'history' && <AssignmentHistoryTab assignments={assignments} />}
            {activeTab === 'maintenance' && (
              <MaintenanceHistoryTab
                tickets={tickets}
                currentRole={currentRole}
                onRaiseTicketClick={() => setIsRaiseTicketModalOpen(true)}
              />
            )}
          </div>

          {/* Assign Asset Modal */}
          <AssignAssetModal
            asset={asset}
            isOpen={isAssignModalOpen}
            onClose={() => setIsAssignModalOpen(false)}
            onAssign={handleAssign}
          />

          {/* Return Asset Modal */}
          <ReturnAssetModal
            asset={asset}
            currentAssignment={currentAssignment}
            isOpen={isReturnModalOpen}
            onClose={() => setIsReturnModalOpen(false)}
            onReturn={handleReturn}
          />

          {/* Edit Asset Modal */}
          <EditAssetModal
            asset={asset}
            isOpen={isEditModalOpen}
            onClose={() => setIsEditModalOpen(false)}
            onUpdate={handleUpdate}
          />

          {/* Raise Ticket Modal */}
          <RaiseTicketModal
            asset={asset}
            isOpen={isRaiseTicketModalOpen}
            onClose={() => setIsRaiseTicketModalOpen(false)}
            onRaiseTicket={handleRaiseTicket}
          />
        </div>
      ) : null}
    </AppLayout>
  )
}
