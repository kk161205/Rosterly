import React, { useEffect, useState, useCallback } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { DashboardHeader } from '@/components/dashboard/DashboardHeader'
import { MetricRibbon } from '@/components/dashboard/MetricRibbon'
import { ActionItemsChecklist } from '@/components/dashboard/ActionItemsChecklist'
import { RecentActivityTimeline } from '@/components/dashboard/RecentActivityTimeline'
import { RoleWidget } from '@/components/dashboard/RoleWidget'
import { FullPageDashboardSkeleton } from '@/components/dashboard/DashboardSkeletons'
import { dashboardService } from '@/services/dashboardService'
import { authService } from '@/services/authService'
import { onboardingService } from '@/services/onboardingService'
import { UserRole, DashboardResponse, DashboardMetricCard } from '@/types/dashboard'
import { UserProfile } from '@/types/auth'
import { authStorage } from '@/utils/authStorage'
import { AlertCircle, RefreshCw } from 'lucide-react'

export const DashboardPage: React.FC = () => {
  const cachedUser = authStorage.getUser()
  const [currentRole, setCurrentRole] = useState<UserRole>((cachedUser?.role as UserRole) || 'employee')
  const [userProfile, setUserProfile] = useState<UserProfile | null>(cachedUser)
  const [dashboardData, setDashboardData] = useState<DashboardResponse | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDashboardData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true)
    else setIsRefreshing(true)
    setError(null)

    try {
      const [summaryData, profileData] = await Promise.allSettled([
        dashboardService.getDashboardSummary(),
        authService.getCurrentUser(),
      ])

      if (summaryData.status === 'fulfilled') {
        setDashboardData(summaryData.value)
        if (summaryData.value.role) {
          setCurrentRole(summaryData.value.role as UserRole)
        }
      } else {
        throw summaryData.reason
      }

      if (profileData.status === 'fulfilled') {
        setUserProfile(profileData.value)
        authStorage.setUser(profileData.value)
      }
    } catch {
      setError('Unable to load live dashboard summary data from server. Please verify network/session.')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboardData()
  }, [fetchDashboardData])

  const handleRefresh = () => {
    fetchDashboardData(true)
  }

  const handleCompleteTask = async (checklistId: string, taskId: string) => {
    try {
      await onboardingService.updateChecklistItem(checklistId, taskId, 'done')
      fetchDashboardData(true)
    } catch {
      setError('Failed to update task status. Please retry.')
    }
  }

  const handlePrimaryAction = () => {
    // Action trigger modal or page redirection based on role
  }

  const effectiveRole = (dashboardData?.role as UserRole) || currentRole

  const metricCards: DashboardMetricCard[] = dashboardData
    ? dashboardService.getMetricRibbonCards(dashboardData)
    : []

  const unreadAlertsCount = dashboardData?.metrics?.unread_alerts_count ?? 0

  return (
    <AppLayout
      currentRole={effectiveRole}
      unreadAlertsCount={unreadAlertsCount}
      userName={userProfile?.full_name}
      userEmail={userProfile?.email || ''}
      isLoading={isLoading}
    >
      {isLoading ? (
        <FullPageDashboardSkeleton />
      ) : (
        <div className="space-y-6">
          {/* Top Header Banner */}
          <DashboardHeader
            role={effectiveRole}
            userName={userProfile?.full_name}
            onRefresh={handleRefresh}
            onPrimaryAction={handlePrimaryAction}
            isRefreshing={isRefreshing}
          />

          {/* Error Banner with Retry per rules.md §2.3 */}
          {error && (
            <div className="p-4 rounded-md bg-error-container text-on-error-container border border-error/20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-error flex-shrink-0" />
                <span className="text-body-sm font-sans font-medium">{error}</span>
              </div>
              <button
                onClick={() => fetchDashboardData()}
                className="px-3 py-1.5 text-xs font-mono font-semibold rounded bg-error text-on-error hover:bg-error/90 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Load</span>
              </button>
            </div>
          )}

          {/* Top KPI Metric Ribbon */}
          <MetricRibbon cards={metricCards} />

          {/* Role-Specific Feature Highlight Widget */}
          {dashboardData?.widgets && (
            <RoleWidget role={effectiveRole} widgets={dashboardData.widgets} />
          )}

          {/* Split Content Grid (Checklist & Timeline) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Section: Action Items & Tasks */}
            <div className="lg:col-span-7">
              <ActionItemsChecklist
                tasks={dashboardData?.widgets?.pending_action_items || []}
                onCompleteTask={handleCompleteTask}
              />
            </div>

            {/* Right Section: Recent Activity Timeline */}
            <div className="lg:col-span-5">
              <RecentActivityTimeline
                activities={dashboardData?.widgets?.recent_activity || []}
              />
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
