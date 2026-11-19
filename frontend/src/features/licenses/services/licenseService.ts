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
}
