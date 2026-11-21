import React, { useState } from 'react'
import { Button, ErrorState, PageHeader, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui'
import { hasPermission, useCurrentUser } from '@/features/auth/hooks/useCurrentUser'
import { useLeaveMutations, useMyLeave, usePendingLeave } from '@/features/leave/hooks/useLeave'
import { LeaveBalances } from '@/features/leave/components/LeaveBalances'
import { QuickAttendanceWidget } from '@/features/leave/components/QuickAttendanceWidget'
import { MyLeaveTable } from '@/features/leave/components/MyLeaveTable'
import { ApplyLeaveModal } from '@/features/leave/components/ApplyLeaveModal'
import { AttendanceHeatmap } from '@/features/leave/components/AttendanceHeatmap'
import { TeamOooSchedule } from '@/features/leave/components/TeamOooSchedule'
import { PendingLeaveTable } from '@/features/leave/components/PendingLeaveTable'
import { LeaveSettings } from '@/features/leave/components/LeaveSettings'
import type { LeaveDecision } from '@/features/leave/types/leave'
import { settingValue, useCompanySettings } from '@/features/admin/services/companySettingsService'
import { getErrorMessage } from '@/lib/errors'

const PAGE_SIZE = 25

/**
 * Leave & attendance: what you have left, your requests, your month,
 * and — for approvers — who's off and what's waiting. HR and super admins also
 * get Settings (leave types, holidays, balances).
 */
export const LeaveAttendancePage: React.FC = () => {
  const { user } = useCurrentUser()
  const canApprove = hasPermission(user, 'leave_request:approve')
  const canManage = hasPermission(user, 'leave_policy:manage')

  const [page, setPage] = useState(1)
  const [pendingPage, setPendingPage] = useState(1)
  const [isApplyOpen, setIsApplyOpen] = useState(false)

  const mine = useMyLeave(undefined, page, PAGE_SIZE)
  const pending = usePendingLeave(pendingPage, PAGE_SIZE, canApprove)
  const { apply, approve, reject, cancel } = useLeaveMutations()
  const settings = useCompanySettings()
  const manualCheckIn = settingValue(settings.data, 'attendance.manual_check_in') === true

  const handleApprove = async (id: string, decision?: LeaveDecision) => {
    await approve.mutateAsync({ id, decision: decision || {} })
  }
  const handleReject = async (id: string, rejection: { comments: string }) => {
    await reject.mutateAsync({ id, rejection })
  }
  const pendingTotal = pending.data?.total ?? 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Leave"
        description="What you have left this year, your requests, and your attendance."
        actions={
          <Button data-guide="leave.apply" variant="primary" onClick={() => setIsApplyOpen(true)}>
            Ask for leave
          </Button>
        }
      />

      <LeaveBalances balances={mine.data?.balances ?? []} />
      {manualCheckIn && <QuickAttendanceWidget employeeId={user?.id} />}

      <Tabs defaultValue="mine">
        <TabsList label="Leave sections">
          <TabsTrigger data-guide="leave.mine" value="mine">My leave</TabsTrigger>
          <TabsTrigger data-guide="leave.attendance" value="attendance">My month</TabsTrigger>
          {canApprove && <TabsTrigger data-guide="leave.team" value="team">{pendingTotal > 0 ? `Team · ${pendingTotal} waiting` : 'Team'}</TabsTrigger>}
          {canManage && <TabsTrigger data-guide="leave.settings" value="settings">Settings</TabsTrigger>}
        </TabsList>

        <TabsContent value="mine" className="pt-6 focus:outline-none">
          {mine.isLoading ? (
            <div className="flex flex-col gap-3" aria-label="Loading leave">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : mine.isError ? (
            <ErrorState message={getErrorMessage(mine.error, 'Your leave could not be loaded.')} onRetry={() => mine.refetch()} />
          ) : (
            <MyLeaveTable
              items={mine.data?.items ?? []}
              total={mine.data?.total ?? 0}
              page={page}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              onApplyClick={() => setIsApplyOpen(true)}
              onCancel={async (id) => {
                await cancel.mutateAsync(id)
              }}
            />
          )}
        </TabsContent>

        <TabsContent value="attendance" className="pt-6 focus:outline-none">
          <AttendanceHeatmap employeeId={user?.id} />
        </TabsContent>

        {canApprove && (
          <TabsContent value="team" className="flex flex-col gap-8 pt-6 focus:outline-none">
            <TeamOooSchedule />
            <section aria-labelledby="leave-waiting-heading" className="flex flex-col gap-3">
              <h2 id="leave-waiting-heading" className="text-section text-ink">
                Waiting for your decision
              </h2>
              <PendingLeaveTable
                items={pending.data?.items ?? []}
                total={pendingTotal}
                page={pendingPage}
                pageSize={PAGE_SIZE}
                onPageChange={setPendingPage}
                onApprove={handleApprove}
                onReject={handleReject}
                isPending={approve.isPending || reject.isPending}
              />
            </section>
          </TabsContent>
        )}

        {canManage && (
          <TabsContent value="settings" className="pt-6 focus:outline-none">
            <LeaveSettings />
          </TabsContent>
        )}
      </Tabs>

      <ApplyLeaveModal
        open={isApplyOpen}
        onClose={() => setIsApplyOpen(false)}
        onApply={async (payload) => {
          await apply.mutateAsync(payload)
        }}
        balances={mine.data?.balances ?? []}
        isPending={apply.isPending}
      />
    </div>
  )
}
