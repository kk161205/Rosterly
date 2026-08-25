import React, { useState, useEffect, useCallback } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { OnboardingProgressGauge } from '@/components/onboarding/OnboardingProgressGauge'
import { OnboardingTaskBoard } from '@/components/onboarding/OnboardingTaskBoard'
import { StartOnboardingModal } from '@/components/onboarding/StartOnboardingModal'
import { OnboardingDetailDrawer } from '@/components/onboarding/OnboardingDetailDrawer'
import { onboardingService } from '@/services/onboardingService'
import { authService } from '@/services/authService'
import {
  OnboardingChecklist,
  OnboardingSummaryMetrics,
  ChecklistItemStatus,
} from '@/types/onboarding'
import { UserRole } from '@/types/dashboard'
import { UserProfile } from '@/types/auth'
import { authStorage } from '@/utils/authStorage'
import {
  UserPlus,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Eye,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react'

export const OnboardingWorkflowPage: React.FC = () => {
  const cachedUser = authStorage.getUser()
  const [currentRole, setCurrentRole] = useState<UserRole>((cachedUser?.role as UserRole) || 'hr_admin')
  const [userProfile, setUserProfile] = useState<UserProfile | null>(cachedUser)

  const [metrics, setMetrics] = useState<OnboardingSummaryMetrics>({
    total_active_onboardings: 0,
    pending_it_tasks: 0,
    pending_hr_tasks: 0,
    avg_completion_days: 0,
    completion_rate: 0,
  })

  const [checklists, setChecklists] = useState<OnboardingChecklist[]>([])
  const [activeChecklistId, setActiveChecklistId] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_progress' | 'completed'>('all')

  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  // Modal & Drawer State
  const [isStartModalOpen, setIsStartModalOpen] = useState(false)
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [profileResult, listResult, metricsResult] = await Promise.allSettled([
        authService.getCurrentUser(),
        onboardingService.getOnboardings(statusFilter),
        onboardingService.getSummaryMetrics(),
      ])

      if (profileResult.status === 'fulfilled') {
        setUserProfile(profileResult.value)
        authStorage.setUser(profileResult.value)
      }

      if (listResult.status === 'fulfilled') {
        const items = listResult.value.checklists
        setChecklists(items)
        if (items.length > 0 && !items.find((c) => c.id === activeChecklistId)) {
          setActiveChecklistId(items[0].id)
        }
      } else {
        throw listResult.reason
      }

      if (metricsResult.status === 'fulfilled') {
        setMetrics(metricsResult.value)
      }
    } catch {
      setError('Unable to load onboarding workflow checklists from server. Please retry.')
    } finally {
      setIsLoading(false)
    }
  }, [statusFilter, activeChecklistId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const activeChecklist = checklists.find((c) => c.id === activeChecklistId) || checklists[0] || null

  const handleUpdateItemStatus = async (itemId: string, newStatus: ChecklistItemStatus) => {
    if (!activeChecklist) return
    setIsUpdatingStatus(true)
    try {
      await onboardingService.updateChecklistItem(activeChecklist.id, itemId, newStatus)
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
      baseRole={userProfile?.role as UserRole | undefined}
      onRoleChange={(r) => setCurrentRole(r)}
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
              <span className="text-accent font-semibold">Onboarding Workflow</span>
            </div>
            <h1 className="font-sans font-bold text-2xl text-on-surface leading-tight">
              Onboarding Workflow Governance
            </h1>
            <p className="text-xs text-on-surface-variant font-body mt-1">
              Multi-department onboarding checklist tracking across HR, IT Provisioning, Facilities, and Managers
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsStartModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-on-accent text-xs font-mono font-semibold hover:bg-accent/90 transition-all shadow-sm cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Start Onboarding</span>
            </button>
          </div>
        </div>

        {/* Dynamic Testing Role Notification Pill */}
        <div className="p-3.5 rounded-xl bg-primary-container/10 border border-primary-container/30 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-accent flex-shrink-0" />
            <span className="font-body text-on-surface">
              Current Active Role Gating: <strong className="font-mono uppercase text-accent">{currentRole}</strong>. Task completion controls interactively enforce this role's authority.
            </span>
          </div>
          <span className="text-[11px] font-mono text-on-surface-variant bg-white px-2 py-0.5 rounded border border-outline-variant/40">
            RBAC Enforced
          </span>
        </div>

        {/* Top Metric Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl border border-outline-variant/60 bg-surface-container-lowest shadow-2xs space-y-2">
            <div className="flex items-center justify-between text-xs font-mono text-on-surface-variant">
              <span>Active Onboardings</span>
              <Users className="w-4 h-4 text-accent" />
            </div>
            <div className="font-mono text-2xl font-bold text-on-surface">
              {metrics.total_active_onboardings}
            </div>
            <div className="text-[11px] font-body text-on-surface-variant">
              In-flight onboarding checklists
            </div>
          </div>

          <div className="p-4 rounded-xl border border-outline-variant/60 bg-surface-container-lowest shadow-2xs space-y-2">
            <div className="flex items-center justify-between text-xs font-mono text-on-surface-variant">
              <span>Pending IT Provisioning</span>
              <Clock className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="font-mono text-2xl font-bold text-indigo-600">
              {metrics.pending_it_tasks}
            </div>
            <div className="text-[11px] font-body text-on-surface-variant">
              Hardware & account tasks
            </div>
          </div>

          <div className="p-4 rounded-xl border border-outline-variant/60 bg-surface-container-lowest shadow-2xs space-y-2">
            <div className="flex items-center justify-between text-xs font-mono text-on-surface-variant">
              <span>Pending HR Tasks</span>
              <Clock className="w-4 h-4 text-rose-600" />
            </div>
            <div className="font-mono text-2xl font-bold text-rose-600">
              {metrics.pending_hr_tasks}
            </div>
            <div className="text-[11px] font-body text-on-surface-variant">
              Contracts & compliance items
            </div>
          </div>

          <div className="p-4 rounded-xl border border-outline-variant/60 bg-surface-container-lowest shadow-2xs space-y-2">
            <div className="flex items-center justify-between text-xs font-mono text-on-surface-variant">
              <span>Completion Rate</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="font-mono text-2xl font-bold text-emerald-600">
              {metrics.completion_rate}%
            </div>
            <div className="text-[11px] font-body text-on-surface-variant">
              Avg time: {metrics.avg_completion_days} days
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
                {st === 'all' ? 'All Onboardings' : st === 'in_progress' ? 'In-Progress' : 'Completed'}
              </button>
            ))}
          </div>

          {/* Employee Selector Dropdown */}
          {checklists.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-on-surface-variant hidden md:inline">
                Active Employee:
              </span>
              <select
                value={activeChecklistId}
                onChange={(e) => setActiveChecklistId(e.target.value)}
                className="h-9 px-3 rounded-lg border border-outline-variant bg-surface text-xs font-medium focus:border-accent outline-none"
              >
                {checklists.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.employee_name} ({c.department_name}) — {c.progress_percentage}% Done
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
            <div className="h-44 bg-surface-container-high/60 rounded-xl" />
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="h-72 bg-surface-container-high/50 rounded-xl" />
              <div className="h-72 bg-surface-container-high/50 rounded-xl" />
              <div className="h-72 bg-surface-container-high/50 rounded-xl" />
              <div className="h-72 bg-surface-container-high/50 rounded-xl" />
            </div>
          </div>
        ) : checklists.length === 0 ? (
          /* Empty State */
          <div className="p-12 text-center border-2 border-dashed border-outline-variant/60 rounded-2xl bg-surface-container-lowest space-y-4">
            <div className="w-16 h-16 rounded-full bg-accent/10 text-accent flex items-center justify-center mx-auto">
              <UserPlus className="w-8 h-8" />
            </div>
            <div className="max-w-md mx-auto">
              <h3 className="font-sans font-bold text-lg text-on-surface">
                No Onboarding Workflows Found
              </h3>
              <p className="text-xs text-on-surface-variant font-body mt-1">
                There are currently no active onboarding checklists matching your selected filter criteria.
              </p>
            </div>
            <button
              onClick={() => setIsStartModalOpen(true)}
              className="px-4 py-2 rounded-lg bg-accent text-on-accent text-xs font-mono font-semibold hover:bg-accent/90 transition-all inline-flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <UserPlus className="w-4 h-4" /> Start Onboarding Workflow
            </button>
          </div>
        ) : activeChecklist ? (
          /* Main Onboarding Workflow Content */
          <div className="space-y-6">
            {/* Top Progress Gauge */}
            <OnboardingProgressGauge checklist={activeChecklist} />

            {/* Department Multi-Role Board */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-sans font-bold text-base text-on-surface">
                  Department Tasks & Clearance Board
                </h3>
                <span className="text-xs font-mono text-on-surface-variant">
                  Click task action to advance status
                </span>
              </div>
              <OnboardingTaskBoard
                items={activeChecklist.items}
                currentRole={currentRole}
                onUpdateStatus={handleUpdateItemStatus}
                isUpdating={isUpdatingStatus}
              />
            </div>
          </div>
        ) : null}

        {/* Modals & Slide-over Drawers */}
        <StartOnboardingModal
          isOpen={isStartModalOpen}
          onClose={() => setIsStartModalOpen(false)}
          onSuccess={loadData}
        />

        <OnboardingDetailDrawer
          checklist={activeChecklist}
          isOpen={isDetailDrawerOpen}
          onClose={() => setIsDetailDrawerOpen(false)}
          currentRole={currentRole}
          onUpdateStatus={handleUpdateItemStatus}
        />
      </div>
    </AppLayout>
  )
}
