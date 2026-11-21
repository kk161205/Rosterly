import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { leaveService } from '@/features/leave/services/leaveService'
import type { LeaveDecision, LeaveRejection, LeaveRequestCreate, LeaveStatus } from '@/features/leave/types/leave'

export const LEAVE_KEY = ['leave-requests'] as const
export const LEAVE_TYPES_KEY = ['leave-types'] as const
export const HOLIDAYS_KEY = ['holidays'] as const

export function useMyLeave(status?: LeaveStatus, page = 1, pageSize = 25) {
  return useQuery({
    queryKey: [...LEAVE_KEY, 'mine', status, page, pageSize],
    queryFn: () => leaveService.getMyLeave(status, page, pageSize),
  })
}

export function usePendingLeave(page = 1, pageSize = 25, enabled = true) {
  return useQuery({
    queryKey: [...LEAVE_KEY, 'pending', page, pageSize],
    queryFn: () => leaveService.getPendingApprovals(page, pageSize),
    enabled,
  })
}

export function useTeamLeave(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: [...LEAVE_KEY, 'team', from, to],
    queryFn: () => leaveService.getTeam(from, to),
    enabled,
  })
}

export function useLeaveTypes(includeInactive = false) {
  return useQuery({
    queryKey: [...LEAVE_TYPES_KEY, includeInactive],
    queryFn: () => leaveService.getLeaveTypes(includeInactive),
  })
}

export function useHolidays(year: number) {
  return useQuery({ queryKey: [...HOLIDAYS_KEY, year], queryFn: () => leaveService.getHolidays(year) })
}

export function useLeaveMutations() {
  const queryClient = useQueryClient()
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: LEAVE_KEY })
    void queryClient.invalidateQueries({ queryKey: ['attendance'] })
  }

  const apply = useMutation({ mutationFn: (data: LeaveRequestCreate) => leaveService.apply(data), onSuccess: refresh })
  const approve = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision?: LeaveDecision }) => leaveService.approve(id, decision),
    onSuccess: refresh,
  })
  const reject = useMutation({
    mutationFn: ({ id, rejection }: { id: string; rejection: LeaveRejection }) => leaveService.reject(id, rejection),
    onSuccess: refresh,
  })
  const cancel = useMutation({ mutationFn: (id: string) => leaveService.cancel(id), onSuccess: refresh })

  return { apply, approve, reject, cancel }
}
