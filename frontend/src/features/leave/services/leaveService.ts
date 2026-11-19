import { apiClient } from '@/lib/api-client'
import type {
  LeaveDecision,
  LeaveRejection,
  LeaveRequestCreate,
  LeaveRequestResponse,
  LeaveStatus,
  MyLeaveResponse,
  PendingLeaveResponse,
} from '@/features/leave/types/leave'

export const leaveService = {
  async apply(data: LeaveRequestCreate): Promise<LeaveRequestResponse> {
    return (await apiClient.post<LeaveRequestResponse>('/leave-requests', data)).data
  },

  async getMyLeave(status?: LeaveStatus, page = 1, pageSize = 25): Promise<MyLeaveResponse> {
    return (
      await apiClient.get<MyLeaveResponse>('/leave-requests/mine', {
        params: { status, page, page_size: pageSize },
      })
    ).data
  },

  async getPendingApprovals(page = 1, pageSize = 25): Promise<PendingLeaveResponse> {
    return (
      await apiClient.get<PendingLeaveResponse>('/leave-requests/pending-approval', {
        params: { page, page_size: pageSize },
      })
    ).data
  },

  async approve(id: string, decision: LeaveDecision = {}): Promise<LeaveRequestResponse> {
    return (await apiClient.post<LeaveRequestResponse>(`/leave-requests/${id}/approve`, decision)).data
  },

  async reject(id: string, rejection: LeaveRejection): Promise<LeaveRequestResponse> {
    return (await apiClient.post<LeaveRequestResponse>(`/leave-requests/${id}/reject`, rejection)).data
  },
}
