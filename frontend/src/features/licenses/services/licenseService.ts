import { apiClient } from '@/lib/api-client'
import type {
  LicenseCreate,
  LicenseHoldersResponse,
  LicenseItem,
  LicenseListResponse,
  LicenseUpdate,
} from '@/features/licenses/types/licenses'

export const licenseService = {
  async list(page = 1, pageSize = 25): Promise<LicenseListResponse> {
    return (
      await apiClient.get<LicenseListResponse>('/software-licenses', {
        params: { page, page_size: pageSize },
      })
    ).data
  },

  async create(data: LicenseCreate): Promise<LicenseItem> {
    return (await apiClient.post<LicenseItem>('/software-licenses', data)).data
  },

  async update(id: string, data: LicenseUpdate): Promise<LicenseItem> {
    return (await apiClient.patch<LicenseItem>(`/software-licenses/${id}`, data)).data
  },

  async getHolders(id: string): Promise<LicenseHoldersResponse> {
    return (await apiClient.get<LicenseHoldersResponse>(`/software-licenses/${id}/holders`)).data
  },

  /** Give someone a seat (IT). */
  async assignSeat(id: string, employeeId: string): Promise<LicenseHoldersResponse> {
    return (await apiClient.post<LicenseHoldersResponse>(`/software-licenses/${id}/assignments`, { employee_id: employeeId })).data
  },

  /** Free a seat (IT). */
  async removeSeat(id: string, assignmentId: string): Promise<LicenseHoldersResponse> {
    return (await apiClient.delete<LicenseHoldersResponse>(`/software-licenses/${id}/assignments/${assignmentId}`)).data
  },
}
