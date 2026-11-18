import React, { useState } from 'react'
import { Plus } from 'lucide-react'
import { PageHeader, Button, Skeleton, ErrorState } from '@/ui'
import { useCurrentUser, hasPermission } from '@/features/auth/hooks/useCurrentUser'
import {
  useLeaveMutations,
  useMyLeave,
  usePendingLeave,
} from '@/features/leave/hooks/useLeave'
import { LeaveQuotaCards } from '@/features/leave/components/LeaveQuotaCards'
import { QuickAttendanceWidget } from '@/features/leave/components/QuickAttendanceWidget'
import { MyLeaveTable } from '@/features/leave/components/MyLeaveTable'
import { ApplyLeaveModal } from '@/features/leave/components/ApplyLeaveModal'
import { AttendanceHeatmap } from '@/features/leave/components/AttendanceHeatmap'
import { TeamOooSchedule } from '@/features/leave/components/TeamOooSchedule'
import { PendingLeaveTable } from '@/features/leave/components/PendingLeaveTable'
import type { LeaveDecision } from '@/features/leave/types/leave'

type ActiveTab = 'my_leave' | 'attendance' | 'team_coverage'

export const LeaveAttendancePage: React.FC = () => {
  const { user } = useCurrentUser()
  const canApprove = hasPermission(user, 'leave_request:approve')

  const [activeTab, setActiveTab] = useState<ActiveTab>('my_leave')
  const [page, setPage] = useState(1)
  const pageSize = 25
  const [pendingPage, setPendingPage] = useState(1)
  const [isApplyOpen, setIsApplyOpen] = useState(false)

  const { data: myLeaveData, isLoading, isError, error, refetch } = useMyLeave(undefined, page, pageSize)
  const { data: pendingData, refetch: refetchPending } = usePendingLeave(pendingPage, pageSize, canApprove)
  const { apply, approve, reject } = useLeaveMutations()

  const myItems = myLeaveData?.items || []
  const myTotal = myLeaveData?.total || 0
  const balances = myLeaveData?.balances || []

  const pendingItems = pendingData?.items || []
  const pendingTotal = pendingData?.total || 0

  const handleApply = async (payload: Parameters<typeof apply.mutateAsync>[0]) => {
    await apply.mutateAsync(payload)
    refetch()
  }

  const handleApprove = async (id: string, decision?: LeaveDecision) => {
    await approve.mutateAsync({ id, decision: decision || {} })
    refetchPending()
    refetch()
  }

  const handleReject = async (id: string, rejection: { comments: string }) => {
    await reject.mutateAsync({ id, rejection })
    refetchPending()
    refetch()
  }

  const tabs: { id: ActiveTab; label: string; count?: number }[] = [
    { id: 'my_leave', label: 'My Leave & History' },
    { id: 'attendance', label: 'Monthly Attendance' },
    ...(canApprove
      ? [{ id: 'team_coverage' as const, label: 'Team Coverage & Approvals', count: pendingTotal }]
      : []),
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Leave & Attendance"
        description="Employee time-off quotas, real-time workplace attendance clock, and team coverage schedules."
        actions={
          <Button variant="primary" onClick={() => setIsApplyOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Apply for Leave
          </Button>
        }
      />

      {/* Top Leave Balance Cards */}
      <LeaveQuotaCards balances={balances} />

      {/* Workplace Digital Clock Widget */}
      <QuickAttendanceWidget employeeId={user?.id} />

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line pb-3" role="tablist">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 rounded-pill px-3.5 py-1 text-body font-medium transition-colors ${
                isActive
                  ? 'bg-ink text-paper'
                  : 'bg-ground text-muted hover:bg-row-hover hover:text-ink'
              }`}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  className={`rounded-pill px-1.5 py-0.2 font-mono text-micro font-semibold ${
                    isActive ? 'bg-paper text-ink' : 'bg-navy text-paper'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Tab Panels */}
      {activeTab === 'my_leave' && (
        <section aria-label="My leave history">
          {isLoading ? (
            <div className="flex flex-col gap-3 py-4" aria-label="Loading leave history">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : isError ? (
            <ErrorState
              message={error instanceof Error ? error.message : 'Could not load leave records.'}
              onRetry={() => refetch()}
            />
          ) : (
            <MyLeaveTable
              items={myItems}
              total={myTotal}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onApplyClick={() => setIsApplyOpen(true)}
            />
          )}
        </section>
      )}

      {activeTab === 'attendance' && (
        <section aria-label="Attendance heatmap">
          <AttendanceHeatmap employeeId={user?.id} />
        </section>
      )}

      {activeTab === 'team_coverage' && canApprove && (
        <section aria-label="Team coverage and approvals" className="flex flex-col gap-6">
          <TeamOooSchedule leaves={[...pendingItems, ...myItems]} />

          <div className="flex flex-col gap-3">
            <h3 className="font-display text-panel text-ink">Pending Leave Approvals Queue</h3>
            <PendingLeaveTable
              items={pendingItems}
              total={pendingTotal}
              page={pendingPage}
              pageSize={pageSize}
              onPageChange={setPendingPage}
              onApprove={handleApprove}
              onReject={handleReject}
              isPending={approve.isPending || reject.isPending}
            />
          </div>
        </section>
      )}

      {/* Apply Leave Modal */}
      <ApplyLeaveModal
        open={isApplyOpen}
        onClose={() => setIsApplyOpen(false)}
        onApply={handleApply}
        balances={balances}
        isPending={apply.isPending}
      />
    </div>
  )
}
