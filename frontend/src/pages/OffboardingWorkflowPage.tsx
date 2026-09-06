import React, { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { OffboardingWarningBanner } from '@/components/offboarding/OffboardingWarningBanner'
import { OffboardingProgressGauge } from '@/components/offboarding/OffboardingProgressGauge'
import { OffboardingTaskBoard } from '@/components/offboarding/OffboardingTaskBoard'
import { StartOffboardingModal } from '@/components/offboarding/StartOffboardingModal'
import { TerminationConfirmModal } from '@/components/offboarding/TerminationConfirmModal'
import { OffboardingDetailDrawer } from '@/components/offboarding/OffboardingDetailDrawer'
import { offboardingService } from '@/services/offboardingService'
import { authService } from '@/services/authService'
import {
  OffboardingChecklist,
  OffboardingSummaryMetrics,
  ChecklistItemStatus,
} from '@/types/offboarding'
import { UserRole } from '@/types/dashboard'
import { UserProfile } from '@/types/auth'
import { authStorage } from '@/utils/authStorage'
import {
  UserMinus,
  Laptop,
  Lock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Eye,
  AlertOctagon,
} from 'lucide-react'

export const OffboardingWorkflowPage: React.FC = () => {
  const cachedUser = authStorage.getUser()
  const [currentRole, setCurrentRole] = useState<UserRole>(
    (cachedUser?.role as UserRole) || 'hr_admin'
  )
  const [userProfile, setUserProfile] = useState<UserProfile | null>(cachedUser)

  const [metrics, setMetrics] = useState<OffboardingSummaryMetrics>({
    total_active_offboardings: 0,
    pending_asset_reclamations: 0,
    pending_access_revocations: 0,
    completed_offboardings: 0,
    avg_completion_days: 0,
  })

  const [checklists, setChecklists] = useState<OffboardingChecklist[]>([])
  const [activeChecklistId, setActiveChecklistId] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_progress' | 'completed'>('all')

  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  // Modals & Drawer State
  const [isStartModalOpen, setIsStartModalOpen] = useState(false)
  const [isTerminateModalOpen, setIsTerminateModalOpen] = useState(false)
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false)

  // Deep-link support: other pages (e.g. Employee Directory / Profile) route here
  // with ?start=<employeeId> instead of duplicating the offboard-initiation flow.
  const [searchParams, setSearchParams] = useSearchParams()
  const [startEmployeeId, setStartEmployeeId] = useState<string | undefined>(undefined)

  useEffect(() => {
    const employeeId = searchParams.get('start')
    if (employeeId) {
      setStartEmployeeId(employeeId)
      setIsStartModalOpen(true)
      const next = new URLSearchParams(searchParams)
      next.delete('start')
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [profileResult, listResult, metricsResult] = await Promise.allSettled([
        authService.getCurrentUser(),
        offboardingService.getOffboardings(statusFilter),
        offboardingService.getSummaryMetrics(),
      ])

      if (profileResult.status === 'fulfilled') {
        setUserProfile(profileResult.value)
        authStorage.setUser(profileResult.value)
        if (profileResult.value.role) {
          setCurrentRole(profileResult.value.role as UserRole)
        }
      }

      if (listResult.status === 'fulfilled') {
        const items = listResult.value.checklists
        setChecklists(items)
        if (items.length > 0 && (!activeChecklistId || !items.find((c) => c.id === activeChecklistId))) {
          setActiveChecklistId(items[0].id)
        }
      } else {
        throw listResult.reason
      }

      if (metricsResult.status === 'fulfilled') {
        setMetrics(metricsResult.value)
      }
    } catch {
      setError('Unable to load offboarding workflow checklists from server. Please retry.')
    } finally {
      setIsLoading(false)
    }
  }, [statusFilter, activeChecklistId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const activeChecklist =
    checklists.find((c) => c.id === activeChecklistId) || checklists[0] || null

  const isAllDone = activeChecklist
    ? activeChecklist.items.length > 0 &&
      activeChecklist.items.every((i) => i.status === 'done')
    : false

  const isHRAdminOrSuper = currentRole === 'hr_admin' || currentRole === 'super_admin'

  const handleUpdateItemStatus = async (itemId: string, newStatus: ChecklistItemStatus) => {
    if (!activeChecklist) return
    setIsUpdatingStatus(true)
    try {
      await offboardingService.updateChecklistItem(activeChecklist.id, itemId, newStatus)
      await loadData()
    } catch {
      setError('Failed to update task status')
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  return (
    <AppLayout
      currentRole={currentRole}
      userName={userProfile?.full_name}
      userEmail={userProfile?.email || ''}
      isLoading={isLoading && checklists.length === 0}
    >
      <div className="space-y-6 select-none">
        {/* Top Page Header & Action Ribbon */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-outline-variant/40 pb-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-on-surface-variant mb-1">
              <span>Dashboard</span>
              <span>/</span>
              <span className="text-accent font-semibold">Offboarding Workflow</span>
            </div>
            <h1 className="font-sans font-bold text-2xl text-on-surface leading-tight">
              Offboarding Workflow Governance
            </h1>
            <p className="text-xs text-on-surface-variant font-body mt-1">
              Unified asset reclamation, account deprovisioning, and zero-trust employee exit lifecycle
            </p>
          </div>

          <div className="flex items-center gap-3">
            {isHRAdminOrSuper && activeChecklist && activeChecklist.status === 'in_progress' && (
              <button
                onClick={() => setIsTerminateModalOpen(true)}
                disabled={!isAllDone}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-mono font-semibold transition-all shadow-sm cursor-pointer ${
                  isAllDone
                    ? 'bg-error text-on-error hover:bg-error/90 animate-pulse'
                    : 'bg-surface-container text-on-surface-variant opacity-60 cursor-not-allowed'
                }`}
                title={isAllDone ? 'Authorize final termination' : 'All items must be marked done first'}
              >
                <AlertOctagon className="w-4 h-4" />
                <span>Finalize Termination</span>
              </button>
            )}

            {isHRAdminOrSuper && (
              <button
                onClick={() => setIsStartModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-warning text-on-warning text-xs font-mono font-semibold hover:bg-warning/90 transition-all shadow-sm cursor-pointer"
              >
                <UserMinus className="w-4 h-4" />
                <span>Start Offboarding</span>
              </button>
            )}
          </div>
        </div>

        {/* Top Metric Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl border border-outline-variant/60 bg-surface-container-lowest shadow-2xs space-y-2">
            <div className="flex items-center justify-between text-xs font-mono text-on-surface-variant">
              <span>Active Offboardings</span>
              <UserMinus className="w-4 h-4 text-warning" />
            </div>
            <div className="font-mono text-2xl font-bold text-on-surface">
              {metrics.total_active_offboardings}
            </div>
            <div className="text-[11px] font-body text-on-surface-variant">
              In-flight employee exits
            </div>
          </div>

          <div className="p-4 rounded-xl border border-outline-variant/60 bg-surface-container-lowest shadow-2xs space-y-2">
            <div className="flex items-center justify-between text-xs font-mono text-on-surface-variant">
              <span>Assets to Reclaim</span>
              <Laptop className="w-4 h-4 text-accent" />
            </div>
            <div className="font-mono text-2xl font-bold text-accent">
              {metrics.pending_asset_reclamations}
            </div>
            <div className="text-[11px] font-body text-on-surface-variant">
              Hardware pending return
            </div>
          </div>

          <div className="p-4 rounded-xl border border-outline-variant/60 bg-surface-container-lowest shadow-2xs space-y-2">
            <div className="flex items-center justify-between text-xs font-mono text-on-surface-variant">
              <span>Access Revocations</span>
              <Lock className="w-4 h-4 text-error" />
            </div>
            <div className="font-mono text-2xl font-bold text-error">
              {metrics.pending_access_revocations}
            </div>
            <div className="text-[11px] font-body text-on-surface-variant">
              IAM & SSO credentials
            </div>
          </div>

          <div className="p-4 rounded-xl border border-outline-variant/60 bg-surface-container-lowest shadow-2xs space-y-2">
            <div className="flex items-center justify-between text-xs font-mono text-on-surface-variant">
              <span>Completed Exits</span>
              <CheckCircle2 className="w-4 h-4 text-success" />
            </div>
            <div className="font-mono text-2xl font-bold text-success">
              {metrics.completed_offboardings}
            </div>
            <div className="text-[11px] font-body text-on-surface-variant">
              Terminated accounts
            </div>
          </div>
        </div>

        {/* Error State Banner */}
        {error && (
          <div className="p-4 rounded-lg bg-error-container text-on-error-container border border-error/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-error flex-shrink-0" />
              <span className="text-xs font-sans font-medium">{error}</span>
            </div>
            <button
              onClick={loadData}
              className="px-3 py-1.5 text-xs font-mono font-semibold rounded bg-error text-on-error hover:bg-error/90 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Retry
            </button>
          </div>
        )}

        {/* Filter Controls & Employee Checklist Selector Ribbon */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-surface-container-low/70 border border-outline-variant/50 rounded-xl">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 bg-surface-container-high/60 p-1 rounded-lg">
            {(['all', 'in_progress', 'completed'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-md text-xs font-mono font-semibold transition-all cursor-pointer ${
                  statusFilter === st
                    ? 'bg-white text-on-surface shadow-2xs font-bold'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {st === 'all'
                  ? 'All Offboardings'
                  : st === 'in_progress'
                  ? 'In-Progress'
                  : 'Completed'}
              </button>
            ))}
          </div>

          {/* Employee Selector Dropdown */}
          {checklists.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-on-surface-variant hidden md:inline">
                Departing Employee:
              </span>
              <select
                value={activeChecklistId}
                onChange={(e) => setActiveChecklistId(e.target.value)}
                className="h-9 px-3 rounded-lg border border-outline-variant bg-surface text-xs font-medium focus:border-accent outline-none"
              >
                {checklists.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.employee_name} ({c.department_name || 'General'}) — {c.progress_percentage}% Done
                  </option>
                ))}
              </select>

              {activeChecklist && (
                <button
                  onClick={() => setIsDetailDrawerOpen(true)}
                  className="px-3 py-1.5 rounded-lg border border-outline-variant bg-white text-xs font-mono font-semibold text-on-surface hover:bg-surface-container-low transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 text-accent" />
                  <span>Audit Detail</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Loading Skeletons */}
        {isLoading ? (
          <div className="space-y-6 animate-pulse">
            <div className="h-20 bg-surface-container-high/60 rounded-xl" />
            <div className="h-44 bg-surface-container-high/60 rounded-xl" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="h-72 bg-surface-container-high/50 rounded-xl" />
              <div className="h-72 bg-surface-container-high/50 rounded-xl" />
              <div className="h-72 bg-surface-container-high/50 rounded-xl" />
            </div>
          </div>
        ) : checklists.length === 0 ? (
          /* Empty State */
          <div className="p-12 text-center border-2 border-dashed border-outline-variant/60 rounded-2xl bg-surface-container-lowest space-y-4">
            <div className="w-16 h-16 rounded-full bg-warning/10 text-warning flex items-center justify-center mx-auto">
              <UserMinus className="w-8 h-8" />
            </div>
            <div className="max-w-md mx-auto">
              <h3 className="font-sans font-bold text-lg text-on-surface">
                No Offboarding Workflows Found
              </h3>
              <p className="text-xs text-on-surface-variant font-body mt-1">
                There are currently no active or recorded offboarding checklists matching your filter criteria.
              </p>
            </div>
            {isHRAdminOrSuper && (
              <button
                onClick={() => setIsStartModalOpen(true)}
                className="px-4 py-2 rounded-lg bg-warning text-on-warning text-xs font-mono font-semibold hover:bg-warning/90 transition-all inline-flex items-center gap-2 cursor-pointer shadow-sm"
              >
                <UserMinus className="w-4 h-4" /> Start Offboarding Workflow
              </button>
            )}
          </div>
        ) : activeChecklist ? (
          /* Main Offboarding Content */
          <div className="space-y-6">
            {/* Visual Warning Banner */}
            <OffboardingWarningBanner checklist={activeChecklist} />

            {/* Top Progress Gauge */}
            <OffboardingProgressGauge checklist={activeChecklist} />

            {/* Categorized Reclamation & Revocation Board */}
            <OffboardingTaskBoard
              checklist={activeChecklist}
              currentRole={currentRole}
              onUpdateStatus={handleUpdateItemStatus}
              isUpdating={isUpdatingStatus}
            />
          </div>
        ) : null}

        {/* Start Offboarding Modal */}
        <StartOffboardingModal
          isOpen={isStartModalOpen}
          onClose={() => {
            setIsStartModalOpen(false)
            setStartEmployeeId(undefined)
          }}
          onSuccess={loadData}
          initialEmployeeId={startEmployeeId}
        />

        {/* Termination Confirmation Modal */}
        {activeChecklist && (
          <TerminationConfirmModal
            isOpen={isTerminateModalOpen}
            checklist={activeChecklist}
            onClose={() => setIsTerminateModalOpen(false)}
            onSuccess={loadData}
          />
        )}

        {/* Detail Audit Drawer */}
        <OffboardingDetailDrawer
          isOpen={isDetailDrawerOpen}
          checklist={activeChecklist}
          onClose={() => setIsDetailDrawerOpen(false)}
        />
      </div>
    </AppLayout>
  )
}
