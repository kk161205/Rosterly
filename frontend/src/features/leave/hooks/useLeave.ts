import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { leaveService } from '@/features/leave/services/leaveService'
import type {
  LeaveDecision,
  LeaveRejection,
  LeaveRequestCreate,
  LeaveStatus,
} from '@/features/leave/types/leave'

export const LEAVE_KEY = ['leave-requests'] as const

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

export function useLeaveMutations() {
  const queryClient = useQueryClient()

  const apply = useMutation({
    mutationFn: (data: LeaveRequestCreate) => leaveService.apply(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LEAVE_KEY })
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
    },
  })

  const approve = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision?: LeaveDecision }) =>
      leaveService.approve(id, decision),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LEAVE_KEY })
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
    },
  })

  const reject = useMutation({
    mutationFn: ({ id, rejection }: { id: string; rejection: LeaveRejection }) =>
      leaveService.reject(id, rejection),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LEAVE_KEY })
    },
  })

  return { apply, approve, reject }
}
