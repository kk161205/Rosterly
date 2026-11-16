import { apiClient } from '@/lib/api-client'
import type {
  AttendanceFilterParams,
  AttendanceListResponse,
  AttendanceRecord,
} from '@/features/leave/types/attendance'

export const attendanceService = {
  async list(params?: AttendanceFilterParams): Promise<AttendanceListResponse> {
    return (await apiClient.get<AttendanceListResponse>('/attendance', { params })).data
  },

  async checkIn(): Promise<AttendanceRecord> {
    return (await apiClient.post<AttendanceRecord>('/attendance/check-in')).data
  },

  async checkOut(): Promise<AttendanceRecord> {
    return (await apiClient.post<AttendanceRecord>('/attendance/check-out')).data
  },
}
