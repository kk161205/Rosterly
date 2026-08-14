import React, { useEffect, useState, useCallback } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { DashboardHeader } from '@/components/dashboard/DashboardHeader'
import { MetricRibbon } from '@/components/dashboard/MetricRibbon'
import { ActionItemsChecklist } from '@/components/dashboard/ActionItemsChecklist'
import { RecentActivityTimeline } from '@/components/dashboard/RecentActivityTimeline'
import { RoleWidget } from '@/components/dashboard/RoleWidget'
import {
  MetricRibbonSkeleton,
  SplitGridSkeleton,
} from '@/components/dashboard/DashboardSkeletons'
import { dashboardService } from '@/services/dashboardService'
import { UserRole, DashboardResponse, DashboardMetricCard } from '@/types/dashboard'
import { AlertCircle, RefreshCw } from 'lucide-react'

export const DashboardPage: React.FC = () => {
  const [currentRole, setCurrentRole] = useState<UserRole>('employee')
  const [dashboardData, setDashboardData] = useState<DashboardResponse | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDashboardData = useCallback(async (role: UserRole, silent = false) => {
    if (!silent) setIsLoading(true)
    else setIsRefreshing(true)
    setError(null)

    try {
      const data = await dashboardService.getDashboardSummary(role)
      setDashboardData(data)
    } catch {
      setError('Unable to load dashboard summary data. Please verify network connection.')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboardData(currentRole)
  }, [currentRole, fetchDashboardData])

  const handleRoleChange = (newRole: UserRole) => {
    setCurrentRole(newRole)
  }

  const handleRefresh = () => {
    fetchDashboardData(currentRole, true)
  }

  const handlePrimaryAction = () => {
    // Action trigger modal or page redirection based on role
    alert(`Primary action triggered for role: ${currentRole.toUpperCase()}`)
  }

  const metricCards: DashboardMetricCard[] = dashboardData
    ? dashboardService.getMetricRibbonCards(dashboardData)
    : []

  const unreadAlertsCount = dashboardData?.metrics?.unread_alerts_count ?? 0

  return (
    <AppLayout
      currentRole={currentRole}
      onRoleChange={handleRoleChange}
      unreadAlertsCount={unreadAlertsCount}
    >
      <div className="space-y-6">
        {/* Top Header Banner */}
        <DashboardHeader
          role={currentRole}
          userName="Kushagra"
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
              onClick={() => fetchDashboardData(currentRole)}
              className="px-3 py-1.5 text-xs font-mono font-semibold rounded bg-error text-on-error hover:bg-error/90 transition-colors inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Load</span>
            </button>
          </div>
        )}

        {/* Top KPI Metric Ribbon */}
        {isLoading ? <MetricRibbonSkeleton /> : <MetricRibbon cards={metricCards} />}

        {/* Role-Specific Feature Highlight Widget */}
        {!isLoading && dashboardData?.widgets && (
          <RoleWidget role={currentRole} widgets={dashboardData.widgets} />
        )}

        {/* Split Content Grid (Checklist & Timeline) */}
        {isLoading ? (
          <SplitGridSkeleton />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Section: Action Items & Tasks */}
            <div className="lg:col-span-7">
              <ActionItemsChecklist
                tasks={dashboardData?.widgets?.pending_action_items || []}
              />
            </div>

            {/* Right Section: Recent Activity Timeline */}
            <div className="lg:col-span-5">
              <RecentActivityTimeline
                activities={dashboardData?.widgets?.recent_activity || []}
              />
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
