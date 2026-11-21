import { apiClient } from '@/lib/api-client'
import type {
  EmployeeBalances,
  Holiday,
  LeaveDecision,
  LeaveRejection,
  LeaveRequestCreate,
  LeaveRequestResponse,
  LeaveStatus,
  LeaveTypeItem,
  LeaveTypePayload,
  MyLeaveResponse,
  PendingLeaveResponse,
  TeamLeaveResponse,
} from '@/features/leave/types/leave'

export const leaveService = {
  async apply(data: LeaveRequestCreate): Promise<LeaveRequestResponse> {
    return (await apiClient.post<LeaveRequestResponse>('/leave-requests', data)).data
  },
  async getMyLeave(status?: LeaveStatus, page = 1, pageSize = 25): Promise<MyLeaveResponse> {
    return (await apiClient.get<MyLeaveResponse>('/leave-requests/mine', { params: { status, page, page_size: pageSize } })).data
  },
  async getPendingApprovals(page = 1, pageSize = 25): Promise<PendingLeaveResponse> {
    return (await apiClient.get<PendingLeaveResponse>('/leave-requests/pending-approval', { params: { page, page_size: pageSize } })).data
  },
  /** Approved and pending leave for the people the caller approves. */
  async getTeam(from: string, to: string): Promise<TeamLeaveResponse> {
    return (await apiClient.get<TeamLeaveResponse>('/leave-requests/team', { params: { from, to } })).data
  },
  async approve(id: string, decision: LeaveDecision = {}): Promise<LeaveRequestResponse> {
    return (await apiClient.post<LeaveRequestResponse>(`/leave-requests/${id}/approve`, decision)).data
  },
  async reject(id: string, rejection: LeaveRejection): Promise<LeaveRequestResponse> {
    return (await apiClient.post<LeaveRequestResponse>(`/leave-requests/${id}/reject`, rejection)).data
  },
  async cancel(id: string): Promise<LeaveRequestResponse> {
    return (await apiClient.post<LeaveRequestResponse>(`/leave-requests/${id}/cancel`)).data
  },

  // Company leave policy (HR / super admin can change; everyone can read)
  async getLeaveTypes(includeInactive = false): Promise<LeaveTypeItem[]> {
    return (await apiClient.get<LeaveTypeItem[]>('/leave-types', { params: { include_inactive: includeInactive || undefined } })).data
  },
  async createLeaveType(payload: LeaveTypePayload): Promise<LeaveTypeItem> {
    return (await apiClient.post<LeaveTypeItem>('/leave-types', payload)).data
  },
  async updateLeaveType(id: string, payload: LeaveTypePayload): Promise<LeaveTypeItem> {
    return (await apiClient.patch<LeaveTypeItem>(`/leave-types/${id}`, payload)).data
  },
  async getHolidays(year: number): Promise<Holiday[]> {
    return (await apiClient.get<Holiday[]>('/holidays', { params: { year } })).data
  },
  async addHoliday(payload: { date: string; name: string }): Promise<Holiday> {
    return (await apiClient.post<Holiday>('/holidays', payload)).data
  },
  async deleteHoliday(id: string): Promise<void> {
    await apiClient.delete(`/holidays/${id}`)
  },
  async getBalances(employeeId: string, year?: number): Promise<EmployeeBalances> {
    return (await apiClient.get<EmployeeBalances>(`/leave-balances/${employeeId}`, { params: { year } })).data
  },
  async adjustBalance(employeeId: string, payload: { leave_type_id: string; days: string; reason: string }): Promise<EmployeeBalances> {
    return (await apiClient.post<EmployeeBalances>(`/leave-balances/${employeeId}/adjust`, payload)).data
  },
}
